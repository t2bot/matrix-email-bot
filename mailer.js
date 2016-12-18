var mailin = require("mailin");
var config = require("config");
var matrix = require("./matrix");
var db = require("./database");

function init() {
  mailin.start({
    port: config.get('mail.port'),
    disableWebhook: true
  });
}

mailin.on('message', function (connection, data, content) {
  db.hasEmailMessage(data.messageId, function(present) {
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

        if(config.rules[roomId]) {
          var ruleConf = config.rules[roomId];
          var skip = true;
          for (var j = 0; j < data.from.length; j++) {
            var fEmail = data.from[j].address;
            if (ruleConf.allow_from.indexOf(fEmail) !== -1) {
              skip = false;
              break;
            }
          }
          if (skip) continue; // TODO: Notify of failure?
        } else continue; // no rules = no sending

        var id = db.writeMessage(emailId, fromEmail, fromName, toEmail, toName, subject, body, isHtml);

        var url = config.get("media.url_format").replace("$id", id);
        db.getMessage(id, function(msg) {
          if(!msg) return;
          msg["url"] = url;

          matrix.postMessageToRoom(msg, roomId);
        });
      }
    }
  });
});

module.exports = {
  init: init
};
