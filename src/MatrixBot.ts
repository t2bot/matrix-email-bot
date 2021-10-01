import { EncryptedFile, MatrixClient } from "matrix-bot-sdk";
import { MessageType } from "./MessageType";
import { getRoomConfig } from "./configUtils";
import * as sanitizeHtml from "sanitize-html";
import * as striptags from "striptags";
import { IDbMessage } from "./storage/DataStore";

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

export class MatrixBot {
    public constructor(public readonly client: MatrixClient) {
    }

    public async sendMessage(message: IDbMessage, roomId: string, messageType = MessageType.Primary) {
        const roomConfig = getRoomConfig(roomId);

        let messageFormat = roomConfig.messageFormat;
        if (messageType !== MessageType.Primary) {
            messageFormat = roomConfig[`${messageType}Format`];
            if (!messageFormat) {
                messageFormat = roomConfig.fragmentFormat;
            }
        }

        let plainFormat = roomConfig.messagePlainFormat;
        if (messageType !== MessageType.Primary) {
            plainFormat = roomConfig[`${messageType}PlainFormat`];
            if (!plainFormat) {
                plainFormat = roomConfig.fragmentPlainFormat;
            }
        }

        for (const entry of Object.entries(message)) {
            const prop = entry[0];
            let val = entry[1];

            if (prop === "html_body") {
                val = sanitizeHtml(val, sanitizerOptions);
            }

            const regex = new RegExp(("$" + prop).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), "g");

            messageFormat = messageFormat.replace(regex, val as string);
            if (plainFormat) plainFormat = plainFormat.replace(regex, val as string);
        }

        const content = {
            body: plainFormat || messageFormat,
            msgtype: "m.text",
        };

        if (!roomConfig.plaintextOnly) {
            content["body"] = plainFormat || striptags(content.body);
            content["formatted_body"] = message.html_body.replace(/\n/g, '<br/>'); // clients are expected to sanitize this
            content["format"] = "org.matrix.custom.html";
        }

        await this.client.sendMessage(roomId, content);
    }

    public async sendAttachment(attachment: any, roomId: string) {
        const roomConfig = getRoomConfig(roomId);

        let msgtype = "m.file";
        if (roomConfig.attachments?.contentMapping?.[attachment.type]) {
            msgtype = roomConfig.attachments.contentMapping[attachment.type];
        }


        let file: Omit<EncryptedFile, "url">;
        if (this.client.crypto) {
            const r = await this.client.crypto.encryptMedia(attachment.content);
            attachment.content = r.buffer;
            file = r.file;
        }

        const mxc = await this.client.uploadContent(attachment.content, attachment.type, attachment.name);

        const content = {
            msgtype,
            body: attachment.name,
            info: {
                mimetype: attachment.type,
            },
        };
        if (file) {
            content["file"] = {
                ...file,
                url: mxc,
            };
        } else {
            content["url"] = mxc;
        }

        await this.client.sendMessage(roomId, content);
    }
}
