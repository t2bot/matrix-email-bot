var mailin = require("mailin");
var config = require("config");
var log = require("npmlog");
var util = require("./utils");
var sanitizeHtml = require("sanitize-html");
var parseReply = require("parse-reply");

// Much of this is based off of matrix-react-sdk's HtmlUtils
// https://github.com/matrix-org/matrix-react-sdk/blob/41936a957fdc5250d7c6c68d87ea4b21896080b0/src/HtmlUtils.js#L83-L140
const sanitizerOptions = {
    allowedTags: [
        'font',
        'del',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
        'nl', 'li', 'b', 'i', 'u', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre'
    ],
    allowedAttributes: {
        // custom ones first:
        font: ['color'], // custom to matrix
        a: ['href', 'name', 'target', 'rel']
    },
    // Lots of these won't come up by default because we don't allow them
    selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
    allowedSchemes: ['http', 'https', 'ftp', 'mailto'],

    // DO NOT USE. sanitize-html allows all URL starting with '//'
    // so this will always allow links to whatever scheme the
    // host page is served over.
    allowedSchemesByTag: {},
};

/**
 * Processes inbound email for sending to Matrix rooms
 */
class EmailHandler {

    // TODO: Use validateSender and validateRecipient to ensure the sender has feedback for the room

    /**
     * Creates a new mail handler
     * @param {MatrixHandler} matrix the Matrix handler instance
     * @param {DataStore} db the database to store messages to
     */
    constructor(matrix, db) {
        this._emailConfig = config.mail;
        this._matrix = matrix;
        this._db = db;

        if(config.get("mail.enabled")) {
            mailin.start({
                port: this._emailConfig.port,
                disableWebhook: true
            });

            //noinspection JSUnusedLocalSymbols
            mailin.on('message', function (connection, data, content) {
                this.processMessage(data);
            }.bind(this));
        }
    }

    /**
     * Processes a given inbound message
     * @param message the message to process
     */
    processMessage(message) {
        this._db.checkMessageNotExists(message.messageId).then(() => {
            var emailTargets = [];

            for (var email of (message.to || []))
                emailTargets.push({address: email.address, name: email.name, source: 'to'});
            for (var email of (message.cc || []))
                emailTargets.push({address: email.address, name: email.name, source: 'cc'});
            for (var email of (message.bcc || []))
                emailTargets.push({address: email.address, name: email.name, source: 'bcc'});

            var primaryFrom = message.from[0];

            log.info("EmailHandler", "Processing message from " + primaryFrom.address + " (sent to " + emailTargets.length + " targets)");

            var rooms = [];
            for (var target of emailTargets) {
                if (!target.address) continue; // skip address - no processing

                let roomConfigs = util.getRoomConfigsForTarget(target.address, target.source);
                if (!roomConfigs) {
                    log.warn("EmailHandler", "No configurations for target (may not be allowed) " + target.address);
                    continue;
                }

                for (var roomConfig of roomConfigs) {
                    if (rooms.indexOf(roomConfig.roomId) !== -1) {
                        log.warn("EmailHandler", "Not handling duplicate message for room " + roomConfig.roomId);
                        continue;
                    }

                    var allowed = true;
                    if (!roomConfig.allowFromAnyone) {
                        for (var fromAddress of message.from) {
                            if (!fromAddress.address)continue;

                            if (roomConfig.allowedSenders.indexOf(fromAddress.address.toLowerCase()) === -1) {
                                log.warn("EmailHandler", "Ignoring from address " + fromAddress.address + " - not on allowed senders list");
                                allowed = false;
                                break;
                            }

                            if (roomConfig.blockedSenders.indexOf(fromAddress.address.toLowerCase()) !== -1) {
                                log.warn("EmailHandler", "Ignoring from address " + fromAddress.address + " - sender is blocked");
                                allowed = false;
                                break;
                            }
                        }
                    } else {
                        log.info("EmailHandler", "Room is set to allow mail from anyone: " + roomConfig.roomId);
                        allowed = true;
                    }

                    if (!allowed) {
                        log.warn("EmailHandler", "Blocking email to room " + roomConfig.roomId + ": sender is not allowed");
                        continue;
                    }

                    rooms.push(roomConfig.roomId);

                    var contentTypeHeader = (message.headers['content-type'] || "text/plain").toLowerCase();
                    var isHtml = contentTypeHeader.indexOf("text/plain") !== 0;
                    var htmlBody = sanitizeHtml(message.html, sanitizerOptions);
                    var textBody = message.text;
                    var fullTextBody = message.text;

                    if (roomConfig.trimReplies) {
                        textBody = parseReply(textBody);
                        // can't trim HTML body nicely, so we won't bother
                    }

                    var dbMessage = this._db.prepareMessage(message.messageId, primaryFrom.address, primaryFrom.name, target.address, target.name, message.subject, textBody, htmlBody, fullTextBody, isHtml, roomConfig.roomId);
                    let matrix = this._matrix;
                    if (roomConfig.skipDatabase) {
                        log.info("EmailHandler", "Message skipped database: Posting message as-is to room");
                        matrix.postMessageToRoom(dbMessage, roomConfig.roomId);
                    } else {
                        this._db.writeMessage(dbMessage).then(msg=> {
                            log.info("EmailHandler", "Message saved. Id = " + msg.id);
                            matrix.postMessageToRoom(msg, roomConfig.roomId);
                        });
                    }
                }
            }
        }, err => {
            log.error("EmailHandler", "Error checking for message: " + err);
        });
    }
}

module.exports = EmailHandler;