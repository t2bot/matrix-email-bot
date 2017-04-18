var mailin = require("mailin");
var config = require("config");
var log = require("npmlog");
var util = require("./utils");
var replyParser = require("node-email-reply-parser");
var _ = require("lodash");
var MessageType = require("./MessageType");

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
                        }
                    } else {
                        log.info("EmailHandler", "Room is set to allow mail from anyone: " + roomConfig.roomId);
                        allowed = true;
                    }

                    // Check for blocked senders outside of the allowFromAnyone check
                    for (var fromAddress of message.from) {
                        if (!fromAddress.address)continue;

                        if (roomConfig.blockedSenders.indexOf(fromAddress.address.toLowerCase()) !== -1) {
                            log.warn("EmailHandler", "Ignoring from address " + fromAddress.address + " - sender is blocked");
                            allowed = false;
                            break;
                        }
                    }

                    if (!allowed) {
                        log.warn("EmailHandler", "Blocking email to room " + roomConfig.roomId + ": sender is not allowed");
                        continue;
                    }

                    var attachments = [];
                    if (message.attachments) {
                        var allowedTypes = (roomConfig["attachments"]["allowedTypes"] || []);
                        var blockedTypes = (roomConfig["attachments"]["blockedTypes"] || []);
                        for (var attachment of message.attachments) {
                            if (!roomConfig["attachments"]["allowAllTypes"] && allowedTypes.indexOf(attachment.contentType) === -1) {
                                log.warn("EmailHandler", "Not processing attachment '" + attachment.generatedFileName + "': Content type '" + attachment.contentType + "' is not allowed");
                                continue;
                            }

                            if (blockedTypes.indexOf(attachment.contentType) !== -1) {
                                log.warn("EmailHandler", "Not processing attachment '" + attachment.generatedFileName + "': Content type '" + attachment.contentType + "' is blocked");
                                continue;
                            }

                            attachments.push({
                                name: attachment.generatedFileName,
                                content: attachment.content,
                                post: roomConfig["attachments"]["post"],
                                type: attachment.contentType
                            });
                        }
                    } else log.warn("EmailHandler", "Not processing attachments: Either no attachments or posting is not permitted");
                    log.info("EmailHandler", "Found " + attachments.length + " valid attachments");

                    rooms.push(roomConfig.roomId);

                    var contentTypeHeader = (message.headers['content-type'] || "text/plain").toLowerCase();
                    var isHtml = contentTypeHeader.indexOf("text/plain") !== 0;
                    var htmlBody = message.html;
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
                            this._writeAndPostMessage(dbMessage, roomConfig, msgType, attachments);
                            msgType = MessageType.FRAGMENT;
                        }
                    }

                    for (var attachment of attachments) {
                        if (!attachment.post) continue;
                        matrix.postAttachmentToRoom(attachment, roomConfig.roomId);
                    }
                }
            }
        }, err => {
            log.error("EmailHandler", "Error checking for message: " + err);
        });
    }

    _writeAndPostMessage(dbMessage, roomConfig, msgType, attachments){
        this._db.writeMessage(dbMessage).then(msg=> {
            log.info("EmailHandler", "Message saved. Id = " + msg.id);
            this._matrix.postMessageToRoom(msg, roomConfig.roomId, msgType);

            this._saveAttachments(attachments, msg);
        });
    }

    _saveAttachments(attachments, message) {
        for (var attachment of attachments) {
            log.info("EmailHandler", "Linking " + attachment.name + " to message " + message.id);
            this._db.saveAttachment(attachment, message.id);
        }
    }
}

module.exports = EmailHandler;