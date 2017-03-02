var mailin = require("mailin");
var config = require("config");
var log = require("npmlog");
var util = require("./utils");
var sanitizeHtml = require("sanitize-html");
var replyParser = require("node-email-reply-parser");
var _ = require("lodash");
var MessageType = require("./MessageType");

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

        if (config.get("mail.enabled")) {
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
                    log.info("EmailHandler", "Processing room config for room: " + roomConfig.roomId);

                    if (rooms.indexOf(roomConfig.roomId) !== -1) {
                        log.warn("EmailHandler", "Not handling duplicate message for room " + roomConfig.roomId);
                        continue;
                    }

                    if (roomConfig["antispam"]) {
                        log.info("EmailHandler", "Performing antispam checks");

                        if (roomConfig["antispam"]["maxScore"] > 0 && roomConfig["antispam"]["maxScore"] <= message.spamScore) {
                            log.warn("EmailHandler", "Spam email detected (" + message.spamScore + " is beyond threshold of " + roomConfig["antispam"]["maxScore"] + "): Voiding message");
                            continue;
                        } else log.info("EmailHandler", "Spam score is within threshold: " + message.spamScore + " < " + roomConfig["antispam"]["maxScore"]);

                        if (roomConfig["antispam"]["blockFailedDkim"] && message.dkim !== "pass") {
                            log.warn("EmailHandler", "Spam email detected (DKIM failure): Voiding message");
                            continue;
                        } else log.info("EmailHandler", "DKIM check passed (enabled = " + roomConfig["antispam"]["blockFailedDkim"] + ")");

                        if (roomConfig["antispam"]["blockFailedSpf"] && message.spf !== "pass") {
                            log.warn("EmailHandler", "Spam email detected (SPF failure): Voiding message");
                            continue;
                        } else log.info("EmailHandler", "SPF check passed (enabled = " + roomConfig["antispam"]["blockFailedSpf"] + ")");
                    }

                    log.info("EmailHandler", "Message passed room's antispam measures");

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

                    var textSegments = [textBody];

                    // can't trim HTML body nicely, so we won't bother
                    if (roomConfig.postReplies) {
                        var fragments = replyParser(textBody).getFragments();
                        textSegments = _.map(fragments, f => f.getContent());
                    } else {
                        textSegments = [replyParser(textBody, true)];
                    }

                    textSegments = _.filter(textSegments, s => s.trim().length > 0);

                    var dbMessages = [];
                    for (var segment of textSegments) {
                        var msg = this._db.prepareMessage(message.messageId, primaryFrom.address, primaryFrom.name, target.address, target.name, message.subject, segment, htmlBody, fullTextBody, isHtml, roomConfig.roomId);
                        dbMessages.push(msg);
                    }

                    let matrix = this._matrix;
                    var msgType = MessageType.PRIMARY;
                    if (roomConfig.skipDatabase) {
                        log.info("EmailHandler", "Message skipped database: Posting message as-is to room");
                        for (var dbMessage of dbMessages) {
                            matrix.postMessageToRoom(dbMessage, roomConfig.roomId, msgType);
                            msgType = MessageType.FRAGMENT;
                        }
                    } else {
                        for (var dbMessage of dbMessages) {
                            this._db.writeMessage(dbMessage).then(msg=> {
                                log.info("EmailHandler", "Message saved. Id = " + msg.id);
                                matrix.postMessageToRoom(msg, roomConfig.roomId, msgType);
                                msgType = MessageType.FRAGMENT;
                            });
                        }
                    }
                }
            }
        }, err => {
            log.error("EmailHandler", "Error checking for message: " + err);
        });
    }
}

module.exports = EmailHandler;