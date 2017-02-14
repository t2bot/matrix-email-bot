var mailin = require("mailin");
var config = require("config");
var log = require("npmlog");
var matrix = require("./matrix");
var db = require("./database");

function init() {
    mailin.start({
        port: config.get('mail.port'),
        disableWebhook: true
    });
}

mailin.on('message', function (connection, data, content) {
    db.hasEmailMessage(data.messageId, function (present) {
        if (present) return; // already processed

        var allTo = data.to;
        var primaryFrom = data.from[0];

        var emailId = data.messageId;
        var fromEmail = primaryFrom.address;
        var fromName = primaryFrom.name;
        var subject = data.subject;
        var body = data.html;
        var isHtml = true; // TODO: Actually detect this

        for (var i = 0; i < allTo.length; i++) {
            var to = allTo[i];

            var toEmail = to.address;
            var toName = to.name;

            if (toEmail.endsWith('@' + config.get('mail.domain'))) {
                var parts = toEmail.split('@')[0].split('_');
                if (parts.length < 2) continue; // Invalid email address
                // TODO: Should this reply back? Configuration option?

                var roomId = "!" + parts.shift() + ":" + parts.join("_");
                log.info("mailer", "Email received for room " + roomId);

                if (config.rules[roomId]) {
                    var ruleConf = config.rules[roomId];

                    var allowedSenders = ruleConf.allow_from;
                    if (!allowedSenders) allowedSenders = config.room_defaults.allow_from || [];

                    var blockedSenders = ruleConf.deny_from;
                    if (!blockedSenders) blockedSenders = config.room_defaults.deny_from || [];

                    // Check allowance first
                    var isAllowed = false;
                    if (allowedSenders.length > 0) {
                        for (var j = 0; j < data.from.length; j++) {
                            var fEmail = data.from[j].address;
                            if (allowedSenders.indexOf(fEmail) !== -1) {
                                log.info("mailer", "Sender " + fEmail + " is allowed to send to room " + roomId);
                                isAllowed = true;
                                break;
                            } else {
                                log.info("mailer", "Sender " + fEmail + " is not on whitelist for room " + roomId);
                            }
                        }
                    } else {
                        log.info("mailer", "No allowed senders configured for room " + roomId);
                        isAllowed = true;
                    }


                    // Now check if they are banned/denied from sending
                    if (isAllowed) {
                        for (var j = 0; j < data.from.length; j++) {
                            var fEmail = data.from[j].address;
                            if (blockedSenders.indexOf(fEmail) !== -1) {
                                log.info("mailer", "Sender " + fEmail + " is NOT allowed to send to room (blacklisted): " + roomId);
                                isAllowed = false;
                                break;
                            }
                        }
                    }

                    if (!isAllowed) {
                        // TODO: Notify sender of failure?
                        log.info("mailer", "Skipping email: From address not permitted to send to room " + roomId);
                        continue;
                    }
                } else {
                    // TODO: Notify sender of failure?
                    log.info("mailer", "Skipping email: No configuration for room " + roomId);
                    continue;
                }


                var roomOptions = config.rules[roomId];
                var skipDb = config.room_defaults.skip_db;
                if (roomOptions.skip_db !== undefined) {
                    skipDb = roomOptions.skip_db;
                }

                var msg = db.prepareMessage(emailId, fromEmail, fromName, toEmail, toName, subject, body, isHtml, roomId);
                if (!skipDb) {
                    var id = db.writeMessage(msg);
                    log.info("mailer", "Message saved as message " + id);
                    db.getMessage(id, function (msg) {
                        matrix.postMessageToRoom(msg, roomId);
                    });
                } else {
                    log.info("mailer", "Message skipped database: posting to room as-is");
                    matrix.postMessageToRoom(msg, roomId);
                }
            } else {
                log.info("mailer", "Skipping email to " + toEmail + " - invalid domain (check your MX records or configuration)");
            }
        }
    });
});

module.exports = {
    init: init
};
