var sqlite3 = require('sqlite3');
var uuid = require("uuid");
var DBMigrate = require("db-migrate");
var log = require("npmlog");
var fs = require("fs");
var path = require("path");

/**
 * Represents the storage mechanism for emails and other information
 */
class DataStore {

    /**
     * Creates a new data store. Does not initialize storage system, call #prepare() to do so
     * @see #prepare
     */
    constructor() {
        this._db = null;
    }

    /**
     * Prepares the storage system for use
     * @returns {Promise} resolved when ready, rejected if there's an error
     */
    prepare() {
        log.info("DataStore", "Starting migration");
        return new Promise((resolve, reject)=> {
            var dbMigrate = DBMigrate.getInstance(true, {
                config: "./config/database.json",
                env: process.env.NODE_ENV || "development"
            });
            dbMigrate.up().then(()=> {
                log.info("DataStore", "Migrated up");
                this._db = new sqlite3.Database("./db/" + (process.env.NODE_ENV || "development") + ".db");
                resolve();
            }, err => {
                log.error("DataStore", "Failed to migrate up");
                log.error("DataStore", err);
                reject(err);
            });
        });
    }

    /**
     * Checks to ensure a message does NOT exist
     * @param {string} messageId the message ID to check for
     * @returns {Promise} resolves if the message does NOT exist, rejected otherwise
     */
    checkMessageNotExists(messageId) {
        return new Promise((resolve, reject)=> {
            this._db.get("SELECT id FROM emails WHERE email_id = ?", messageId, function (err, row) {
                log.info("DataStore", "checkMessageNotExists - found message " + messageId + "? " + (row ? true : false));
                if (err) reject(err);
                else if (row) reject(new Error("Message already exists"));
                else resolve();
            });
        });
    }

    /**
     * Prepares several parameters into a DTO ready to be saved to the storage system
     * @param {string} messageId the email message ID, normally unique to the message
     * @param {string} fromAddress the email address the message was received from
     * @param {string} fromName the name of the sender. Null/undefined values are converted to empty strings
     * @param {string} toAddress the email address the message was sent to
     * @param {string} toName the name of the receiver. Null/undefined values are converted to empty strings
     * @param {string} subject the subject for the email message
     * @param {string} text the plaintext body for the email message; can be trimmed of replies/signatures/etc
     * @param {string} html the HTML body for the email message (even if the message wasn't HTML)
     * @param {string} fullTextBody the full, untrimmed, text body for the email message
     * @param {boolean} isHtml true if the original email was intended to be HTML, false otherwise
     * @param {string} roomId the target room ID for the message
     * @returns {{email_id: string, from_name: string, from_email: string, to_name: string, to_email: string, subject: string, text_body: string, html_body: string, full_text_body: string, is_html: boolean, target_room: string}} a DTO for the storage system (used for #writeMessage())
     * @see #writeMessage
     */
    prepareMessage(messageId, fromAddress, fromName, toAddress, toName, subject, text, html, fullTextBody, isHtml, roomId) {
        log.info("DataStore", "prepareMessage - creating for message ID " + messageId);
        return {
            email_id: messageId,
            from_name: fromName || "",
            from_email: fromAddress,
            to_name: toName || "",
            to_email: toAddress,
            subject: subject,
            text_body: text,
            html_body: html,
            full_text_body: fullTextBody,
            is_html: isHtml,
            target_room: roomId
        };
    }

    /**
     * Writes a DTO to the storage system
     * @param {{email_id: string, from_name: string, from_email: string, to_name: string, to_email: string, subject: string, text_body: string, html_body: string, full_text_body: string, is_html: boolean, target_room: string}} message the message to write
     * @returns {Promise} resolves with the implementation message written (eg: DB object), rejected if writing fails
     */
    writeMessage(message) {
        log.info("DataStore", "writeMessage - Starting write for " + message.email_id);
        return new Promise((resolve, reject)=> {
            var id = uuid.v4();
            this._db.run("INSERT INTO emails (id, email_id, from_email, from_name, to_email, to_name, subject, text_body, html_body, full_text_body, is_html, received_timestamp, target_room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
                id, message.email_id, message.from_email, message.from_name, message.to_email, message.to_name, message.subject, message.text_body, message.html_body, message.full_text_body, message.is_html, message.target_room,
                function (generatedId, error) {
                    log.info("DataStore", "writeMessage - Message written (" + (error ? false : true) + "): " + id + " (" + message.email_id + ")");
                    if (error)reject(error);
                    else this.getMessage(id).then(resolve, reject);
                }.bind(this));
        });
    }

    /**
     * Saves an attachment
     * @param {{name: string, content: Buffer, type: string}} attachment the attachment to save
     * @param {String} messageId the message ID to link the attachment to
     */
    saveAttachment(attachment, messageId) {
        log.info("DataStore", "saveAttachment - Starting write for " + attachment.name);
        return new Promise((resolve, reject) => {
            var id = uuid.v4();
            var target = path.join(".", "db", "attachments", id + ".attachment");
            fs.writeFileSync(target, attachment.content);
            log.info("DataStore", "saveAttachment - Attachment written to file: " + target);
            this._db.run("INSERT INTO attachments (id, email_id, file_name, content_type) VALUES (?, ?, ?, ?)",
                id, messageId, attachment.name, attachment.type,
                function (generatedId, error) {
                log.info("DataStore", "saveAttachment - Attachment saved to DB (" + (error ? false : true) + ": " + id + " to message " + messageId);
                if (error)reject(error);
                else resolve();
            }.bind(this));
        });
    }

    /**
     * Retrieves a raw email message from the underlying storage system. For example, the database record for the email
     * @param {string} id the record ID to lookup
     * @returns {Promise} resolves with the raw record, rejected if there was an error
     */
    getMessage(id) {
        log.info("DataStore", "getMessage - Fetch " + id);
        return new Promise((resolve, reject)=> {
            this._db.get("SELECT * FROM emails WHERE id = ?", id, function (err, row) {
                log.info("DataStore", "getMessage - Found " + id + "? " + (row ? true : false));
                if (err)reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = DataStore;