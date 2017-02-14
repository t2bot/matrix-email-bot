var sqlite3 = require('sqlite3');
var uuid = require("uuid");

var db = new sqlite3.Database("db/" + (process.env.NODE_ENV || "development") + ".db");

function init() {
    db.serialize(function () {
        db.run("CREATE TABLE IF NOT EXISTS captured_emails (id TEXT PRIMARY KEY NOT NULL, email_id TEXT NOT NULL, from_email TEXT NOT NULL, from_name TEXT NOT NULL, to_email TEXT NOT NULL, to_name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, is_html TINYINT NOT NULL, received_timestamp DATETIME)");
    });
}
function prepareMessage(emailId, fromEmail, fromName, toEmail, toName, subject, body, isHtml) {
    return {
        email_id: emailId,
        from_name: fromName,
        from_email: fromEmail,
        to_name: toName,
        to_email: toEmail,
        subject: subject,
        body: body,
        is_html: isHtml
    };
}

function writeMessage(message) {
    var id = uuid.v4();
    db.run("INSERT INTO captured_emails (id, email_id, from_name, from_email, to_name, to_email, subject, body, is_html, received_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
        id, message.email_id, message.from_name, message.from_email, message.to_name, message.to_email, message.subject, message.body, message.is_html ? 1 : 0);
    return id;
}

function getMessage(id, callback) {
    db.get("SELECT * FROM captured_emails WHERE id = ?", id, function (err, row) {
        callback(err ? null : row);
    });
}

function hasEmailMessage(emailId, callback) {
    db.get("SELECT id FROM captured_emails WHERE email_id = ?", emailId, function (err, row) {
        callback(err ? false : (row ? true : false));
    });
}

module.exports = {
    init: init,
    writeMessage: writeMessage,
    prepareMessage: prepareMessage,
    getMessage: getMessage,
    hasEmailMessage: hasEmailMessage
};
