const mailin = require("mailin");
const config = require("config");
import LogService from "matrix-js-snippets/lib/LogService";
const util = require("./utils");
const replyParser = require("node-email-reply-parser");
const _ = require("lodash");
const MessageType = require("./MessageType");

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
            const emailTargets = [];

            for (let email of (message.to || []))
                emailTargets.push({address: email.address, name: email.name, source: 'to'});
            for (let email of (message.cc || []))
                emailTargets.push({address: email.address, name: email.name, source: 'cc'});
            for (let email of (message.bcc || []))
                emailTargets.push({address: email.address, name: email.name, source: 'bcc'});

            const primaryFrom = message.from[0];

            LogService.info("EmailHandler", "Processing message from " + primaryFrom.address + " (sent to " + emailTargets.length + " targets)");

            const rooms = [];
            for (let target of emailTargets) {
                if (!target.address) continue; // skip address - no processing

                let roomConfigs = util.getRoomConfigsForTarget(target.address, target.source);
                if (!roomConfigs) {
                    LogService.warn("EmailHandler", "No configurations for target (may not be allowed) " + target.address);
                    continue;
                }

                for (let roomConfig of roomConfigs) {
                    LogService.info("EmailHandler", "Processing room config for room: " + roomConfig.roomId);

                    if (rooms.indexOf(roomConfig.roomId) !== -1) {
                        LogService.warn("EmailHandler", "Not handling duplicate message for room " + roomConfig.roomId);
                        continue;
                    }

                    if (roomConfig["antispam"]) {
                        LogService.info("EmailHandler", "Performing antispam checks");

                        if (roomConfig["antispam"]["maxScore"] > 0 && roomConfig["antispam"]["maxScore"] <= message.spamScore) {
                            LogService.warn("EmailHandler", "Spam email detected (" + message.spamScore + " is beyond threshold of " + roomConfig["antispam"]["maxScore"] + "): Voiding message");
                            continue;
                        } else LogService.info("EmailHandler", "Spam score is within threshold: " + message.spamScore + " < " + roomConfig["antispam"]["maxScore"]);

                        if (roomConfig["antispam"]["blockFailedDkim"] && message.dkim !== "pass") {
                            LogService.warn("EmailHandler", "Spam email detected (DKIM failure): Voiding message");
                            continue;
                        } else LogService.info("EmailHandler", "DKIM check passed (enabled = " + roomConfig["antispam"]["blockFailedDkim"] + ")");

                        if (roomConfig["antispam"]["blockFailedSpf"] && message.spf !== "pass") {
                            LogService.warn("EmailHandler", "Spam email detected (SPF failure): Voiding message");
                            continue;
                        } else LogService.info("EmailHandler", "SPF check passed (enabled = " + roomConfig["antispam"]["blockFailedSpf"] + ")");
                    }

                    LogService.info("EmailHandler", "Message passed room's antispam measures");

                    let allowed = true;
                    if (!roomConfig.allowFromAnyone) {
                        for (let fromAddress of message.from) {
                            if (!fromAddress.address)continue;

                            if (roomConfig.allowedSenders.indexOf(fromAddress.address.toLowerCase()) === -1) {
                                LogService.warn("EmailHandler", "Ignoring from address " + fromAddress.address + " - not on allowed senders list");
                                allowed = false;
                                break;
                            }
                        }
                    } else {
                        LogService.info("EmailHandler", "Room is set to allow mail from anyone: " + roomConfig.roomId);
                        allowed = true;
                    }

                    // Check for blocked senders outside of the allowFromAnyone check
                    for (let fromAddress of message.from) {
                        if (!fromAddress.address)continue;

                        if (roomConfig.blockedSenders.indexOf(fromAddress.address.toLowerCase()) !== -1) {
                            LogService.warn("EmailHandler", "Ignoring from address " + fromAddress.address + " - sender is blocked");
                            allowed = false;
                            break;
                        }
                    }

                    if (!allowed) {
                        LogService.warn("EmailHandler", "Blocking email to room " + roomConfig.roomId + ": sender is not allowed");
                        continue;
                    }

                    const attachments = [];
                    if (message.attachments) {
                        const allowedTypes = (roomConfig["attachments"]["allowedTypes"] || []);
                        const blockedTypes = (roomConfig["attachments"]["blockedTypes"] || []);
                        for (let attachment of message.attachments) {
                            if (!roomConfig["attachments"]["allowAllTypes"] && allowedTypes.indexOf(attachment.contentType) === -1) {
                                LogService.warn("EmailHandler", "Not processing attachment '" + attachment.generatedFileName + "': Content type '" + attachment.contentType + "' is not allowed");
                                continue;
                            }

                            if (blockedTypes.indexOf(attachment.contentType) !== -1) {
                                LogService.warn("EmailHandler", "Not processing attachment '" + attachment.generatedFileName + "': Content type '" + attachment.contentType + "' is blocked");
                                continue;
                            }

                            attachments.push({
                                name: attachment.generatedFileName,
                                content: attachment.content,
                                post: roomConfig["attachments"]["post"],
                                type: attachment.contentType
                            });
                        }
                    } else LogService.warn("EmailHandler", "Not processing attachments: Either no attachments or posting is not permitted");
                    LogService.info("EmailHandler", "Found " + attachments.length + " valid attachments");

                    rooms.push(roomConfig.roomId);

                    const contentTypeHeader = (message.headers['content-type'] || "text/plain").toLowerCase();
                    const isHtml = contentTypeHeader.indexOf("text/plain") !== 0;
                    const htmlBody = message.html;
                    const textBody = message.text;
                    const fullTextBody = message.text;

                    let textSegments = [textBody];

                    // can't trim HTML body nicely, so we won't bother
                    if (roomConfig.postReplies) {
                        const fragments = replyParser(textBody).getFragments();
                        textSegments = _.map(fragments, f => f.getContent());
                    } else {
                        textSegments = [replyParser(textBody, true)];
                    }

                    textSegments = _.filter(textSegments, s => s.trim().length > 0);

                    const dbMessages = [];
                    for (let segment of textSegments) {
                        const msg = this._db.prepareMessage(message.messageId, primaryFrom.address, primaryFrom.name, target.address, target.name, message.subject, segment, htmlBody, fullTextBody, isHtml, roomConfig.roomId);
                        dbMessages.push(msg);
                    }

                    let matrix = this._matrix;
                    let msgType = MessageType.PRIMARY;
                    if (roomConfig.skipDatabase) {
                        LogService.info("EmailHandler", "Message skipped database: Posting message as-is to room");
                        for (let dbMessage of dbMessages) {
                            matrix.postMessageToRoom(dbMessage, roomConfig.roomId, msgType);
                            msgType = MessageType.FRAGMENT;
                        }
                    } else {
                        for (let dbMessage of dbMessages) {
                            this._writeAndPostMessage(dbMessage, roomConfig, msgType, attachments);
                            msgType = MessageType.FRAGMENT;
                        }
                    }

                    for (let attachment of attachments) {
                        if (!attachment.post) continue;
                        matrix.postAttachmentToRoom(attachment, roomConfig.roomId);
                    }
                }
            }
        }, err => {
            LogService.error("EmailHandler", "Error checking for message: " + err);
        });
    }

    _writeAndPostMessage(dbMessage, roomConfig, msgType, attachments){
        this._db.writeMessage(dbMessage).then(msg=> {
            LogService.info("EmailHandler", "Message saved. Id = " + msg.id);
            this._matrix.postMessageToRoom(msg, roomConfig.roomId, msgType);

            this._saveAttachments(attachments, msg);
        });
    }

    _saveAttachments(attachments, message) {
        for (let attachment of attachments) {
            LogService.info("EmailHandler", "Linking " + attachment.name + " to message " + message.id);
            this._db.saveAttachment(attachment, message.id);
        }
    }
}

module.exports = EmailHandler;