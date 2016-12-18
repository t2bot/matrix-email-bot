var express = require('express');
var config = require("config");
var db = require("./database");

var app = express();

app.get('/_m.email/api/v1/message/:id', function(request, response) {
  db.getMessage(request.params.id, function(msg) {
    if(!msg) response.send(404);
    else {
      msg.email_id = undefined; // redact message id from result
      response.setHeader("Content-Type", "application/json");
      response.send(JSON.stringify(msg));
    }
  });
});

app.get('/m/:id', function(request, response) {
  db.getMessage(request.params.id, function(msg) {
    if(!msg){
      response.status(404);
      response.render("404", { title: "404: Message Not Found" });
    } else {
      response.render("message", { title: msg.subject, message: msg });
    }
  });
});

function init() {
  app.set("view engine", "pug");
  app.listen(config.get("web.port"), config.get("web.bind_ip"));
}

module.exports = {
  init: init
};
