const config = require("config");
const sdk = require("matrix-js-sdk");
const striptags = require("striptags");
import LogService from "matrix-js-snippets/lib/LogService";
const util = require("./utils");
const MessageType = require("./MessageType");
const streamifier = require("streamifier");
const sanitizeHtml = require("sanitize-html");
const _ = require("lodash");

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
 * Handles matrix traffic for the bot
 */
class MatrixHandler {

    /**
     * Creates a new Matrix handler and starts the bot's connection to the homeserver
     */
    constructor() {
        this._roomList = [];
        this._userId = config.get("matrix.userId");
        this._client = sdk.createClient({
            baseUrl: config.get("matrix.homeserverUrl"),
            accessToken: config.get("matrix.accessToken"),
            userId: this._userId
        });

        this._client.on('sync', (state, prevState, data) => {
            switch (state) {
                case 'PREPARED':
                    this._updateRoomList();
                    break;
            }
        });

        this._client.on('Room', this._updateRoomList.bind(this));

        this._client.startClient(25); // limit number of messages to keep, we're not interesting in keeping history here
    }

    /**
     * Updates the internal list of known rooms
     * @private
     */
    _updateRoomList() {
        LogService.info("MatrixHandler - _updateRoomList", "Updating room list");
        const roomList = [];

        const rooms = this._client.getRooms();
        _.forEach(rooms, room => {
            let me = room.getMember(this._userId);
            if (!me) return;

            if (me.membership === "invite") {
                LogService.info("MatrixHandler", "Received invite to " + room.currentState.roomId);
                this._client.joinRoom(room.currentState.roomId).catch(error => {
                    LogService.error("MatrixHandler", "Error joining room " + room.currentState.roomId);
                    LogService.error("MatrixHandler", error);
                });
                return;
            }

            if (me.membership !== "join") return;
            roomList.push(room.currentState.roomId);
        });

        this._roomList = roomList;
        LogService.info("MatrixHandler - _updateRoomList", "Currently in " + this._roomList.length + " rooms");
    }

    /**
     * Posts an email message to the room given.
     * @param {*} message the email message to post
     * @param {String} roomId the room ID to post to
     * @param {MessageType} [messageType] the type of message (defaults to MessageType.PRIMARY)
     */
    postMessageToRoom(message, roomId, messageType) {
        if (!messageType) messageType = MessageType.PRIMARY;

        if (this._roomList.indexOf(roomId) === -1) {
            LogService.warn("MatrixHandler", "Attempt to send message to room " + roomId + ", but not in that room");
            return; // not in room - skip message
        }

        let config = util.getRoomConfig(roomId);
        if (!config) {
            LogService.error("MatrixHandler", "No configuration for room " + roomId + ", but a message was supposed to go there");
            return;
        }

        let mtxMessage = config.messageFormat;
        if (messageType !== MessageType.PRIMARY) {
            mtxMessage = config[messageType.toString().toLowerCase() + "Format"];
            if (!mtxMessage) {
                LogService.warn("MatrixHandler", "Could not find format for message type '" + messageType.toString() + "', using fragmentFormat");
                mtxMessage = config["fragmentFormat"];
            }
        }

        let plainMtxMessage = config.messagePlainFormat;
        if (messageType !== MessageType.PRIMARY) {
            plainMtxMessage = config[messageType.toString().toLowerCase() + "PlainFormat"];
            if (!plainMtxMessage) {
                LogService.warn("MatrixHandler", "Could not find plain text format for message type '" + messageType.toString() + "', using fragmentPlainFormat");
                plainMtxMessage = config["fragmentPlainFormat"];
            }
        }

        for (let property of _.keys(message)) {
            let val = message[property];
            if (property === "html_body")
                val = sanitizeHtml(val, sanitizerOptions);

            const propertyRegex = new RegExp(("$" + property).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), "g");

            mtxMessage = mtxMessage.replace(propertyRegex, val);
            if (plainMtxMessage) plainMtxMessage = plainMtxMessage.replace(propertyRegex, val);
        }

        const mtxContent = {
            body: plainMtxMessage || mtxMessage,
            msgtype: "m.text"
        };

        if (!config.plaintextOnly) {
            LogService.info("MatrixHandler", "Preparing HTML message for room " + roomId);
            mtxContent["body"] = plainMtxMessage || striptags(mtxContent.body);
            mtxContent["formatted_body"] = mtxMessage.replace(/\n/g, '<br/>'); // clients are responsible for processing the HTML
            mtxContent["format"] = "org.matrix.custom.html";
        }

        LogService.info("MatrixHandler", "Sending message to room " + roomId);
        this._client.sendMessage(roomId, mtxContent);
    }

    /**
     * Posts an email attachment to the room given
     * @param {{name: string, content: Buffer, type: string}} attachment the attachment to post
     * @param {String} roomId the room ID to post to
     */
    postAttachmentToRoom(attachment, roomId) {
        LogService.info("MatrixHandler", "Posting attachment '" + attachment.name + "' to room " + roomId);
        if (this._roomList.indexOf(roomId) === -1) {
            LogService.warn("MatrixHandler", "Attempt to send message to room " + roomId + ", but not in that room");
            return; // not in room - skip message
        }

        let config = util.getRoomConfig(roomId);
        if (!config) {
            LogService.error("MatrixHandler", "No configuration for room " + roomId + ", but a message was supposed to go there");
            return;
        }

        let eventType = "m.file";
        if (config["attachments"]["contentMapping"][attachment.type]) {
            eventType = config["attachments"]["contentMapping"][attachment.type];
        }

        LogService.info("MatrixHandler", "Uploading attachment '" + attachment.name + "' to room " + roomId);
        this._client.uploadContent({
            stream: streamifier.createReadStream(attachment.content),
            name: attachment.name
        }).then(url => {
            LogService.info("MatrixHandler", "Got MXC URL for '" + attachment.name + "': " + url);
            const content = {
                msgtype: eventType,
                body: attachment.name,
                url: JSON.parse(url).content_uri,
                info: {
                    mimetype: attachment.type
                }
            };
            LogService.info("MatrixHandler", "Posting attachment '" + attachment.name + "' to room " + roomId + " as event type " + eventType);
            this._client.sendMessage(roomId, content);
        });
    }
}

module.exports = MatrixHandler;