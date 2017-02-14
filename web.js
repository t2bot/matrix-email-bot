var express = require('express');
var config = require("config");
var db = require("./database");

var app = express();

app.get('/_m.email/api/v1/message/:id', function (request, response) {
    db.getMessage(request.params.id, function (msg) {
        if (!msg) response.send(404);
        else {
            msg.email_id = undefined; // redact message id from result
            response.setHeader("Content-Type", "application/json");
            response.send(JSON.stringify(msg));
        }
    });
});

app.get('/m/:id', function (request, response) {
    db.getMessage(request.params.id, function (msg) {
        if (!msg) {
            response.status(404);
            response.render("404", {title: "404: Message Not Found"});
        } else {
            response.render("message", {title: msg.subject, message: msg});
        }
    });
});

app.delete('/m/:id', function (request, response) {
    db.getMessage(request.params.id, function (msg) {
        if (!msg) {
            response.status(404);
            response.json({error: "message not found "});
        } else {
            var roomConfig = config.rules[msg.target_room];
            if (!roomConfig) {
                response.status(401);
                response.json({error: "Invalid secret "});
            } else if (roomConfig.delete_key != request.params.deleteKey) {
                response.status(401);
                response.json({error: "Invalid secret "});
            } else {
                db.deleteMessage(msg.id, function (success) {
                    if (success) {
                        response.status(200);
                        response.json({message: "Message deleted "});
                    } else {
                        response.status(500);
                        response.json({error: "Internal Server Error"});
                    }
                });
            }
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
