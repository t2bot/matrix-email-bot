var sqlite3 = require('sqlite3');
var uuid = require("uuid");

var db = new sqlite3.Database("db/" + (process.env.NODE_ENV || "development") + ".db");

function init() {
    db.serialize(function () {
        // TODO: Proper migration scripts
        db.run("CREATE TABLE IF NOT EXISTS captured_emails (id TEXT PRIMARY KEY NOT NULL, email_id TEXT NOT NULL, from_email TEXT NOT NULL, from_name TEXT NOT NULL, to_email TEXT NOT NULL, to_name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, is_html TINYINT NOT NULL, received_timestamp DATETIME)");
        db.all("PRAGMA table_info(captured_emails)", function (err, rows) {
            var addTargetRoomCol = true;
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (row.name == "target_room") {
                    addTargetRoomCol = false;
                    break;
                }
            }

            if (addTargetRoomCol)
                db.run("ALTER TABLE captured_emails ADD COLUMN target_room TEXT NOT NULL DEFAULT 'Unknown'");
        });
    });
}
function prepareMessage(emailId, fromEmail, fromName, toEmail, toName, subject, body, isHtml, targetRoom) {
    return {
        email_id: emailId,
        from_name: fromName,
        from_email: fromEmail,
        to_name: toName,
        to_email: toEmail,
        subject: subject,
        body: body,
        is_html: isHtml,
        target_room: targetRoom
    };
}

function writeMessage(message) {
    var id = uuid.v4();
    db.run("INSERT INTO captured_emails (id, email_id, from_name, from_email, to_name, to_email, subject, body, is_html, received_timestamp, target_room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
        id, message.email_id, message.from_name, message.from_email, message.to_name, message.to_email, message.subject, message.body, message.is_html ? 1 : 0, message.target_room);
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

function deleteMessage(id, callback) {
    db.run("DELETE FROM captured_emails WHERE email_id = ?", id, function (err) {
        callback(err ? false : true);
    });
}

module.exports = {
    init: init,
    writeMessage: writeMessage,
    prepareMessage: prepareMessage,
    getMessage: getMessage,
    hasEmailMessage: hasEmailMessage,
    deleteMessage: deleteMessage
};
