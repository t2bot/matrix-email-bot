const express = require('express');
const config = require("config");
import LogService from "matrix-js-snippets/lib/LogService";
const mailparser = require("mailparser").simpleParser;

/**
 * Handles web requests
 */
class WebHandler {

    /**
     * Creates a new web handler backed by a given datastore
     * @param {DataStore} db the datastore to back the web handler with
     * @param {EmailHandler} emailHandler the email handler to post received messages to
     */
    constructor(db, emailHandler) {
        this._db = db;
        this._emailHandler = emailHandler;
        this._app = express();

        // Process text/plain mime types
        this._app.use(function (req, res, next) {
            if (req.is('text/*')) {
                req.text = '';
                req.setEncoding('utf8');
                req.on('data', function (chunk) {
                    req.text += chunk
                });
                req.on('end', next);
            } else {
                next();
            }
        });

        this._app.get("/_m.email/api/v1/message/:id", function (request, response) {
            this._apiGetMessage(request, response);
        }.bind(this));

        this._app.post("/_m.email/api/v1/message", function (request, response) {
            this._apiPostMessage(request, response);
        }.bind(this));

        this._app.get("/m/:id", function (request, response) {
            this._renderMessage(request, response);
        }.bind(this));

        this._app.set("view engine", "pug");
        this._app.listen(config.get("web.port"), config.get("web.bindIp"));

        LogService.info("WebHandler", "Listening on " + config.get("web.bindIp") + ":" + config.get("web.port"));
    }

    /**
     * API endpoint for getting a message (JSON)
     * @param request the request
     * @param response the response
     * @private
     */
    _apiGetMessage(request, response) {
        LogService.info("WebHandler", "_apiGetMessage - Get " + request.params.id);
        this._db.getMessage(request.params.id).then(message => {
            if (message) {
                message.email_id = undefined; // redact message id from result
                response.setHeader("Content-Type", "application/json");
                response.send(JSON.stringify(message));
            } else response.send(404);
        });
    }

    /**
     * API endpoint for posting a new message (raw email body)
     * @param request the request
     * @param response the response
     * @private
     */
    _apiPostMessage(request, response) {
        LogService.info("WebHandler", "_apiPostMessage - POST new message");
        if (request.query.secret !== config.get("web.secret")) {
            LogService.warn("WebHandler", "_apiPostMessage - Invalid secret used");
            response.sendStatus(401);
            return;
        }

        const mailBody = request.text;
        mailparser(mailBody).then(mail => {
            if (!mail || !mail.messageId) {
                LogService.error("WebHandler", "_apiPostMessage - Failed to parse message");
                response.sendStatus(500);
            } else {
                mail.to = mail.to.value;
                mail.from = mail.from.value;
                mail.cc = (mail.cc || {value: []}).value;
                mail.bcc = (mail.bcc || {value: []}).value;

                this._emailHandler.processMessage(mail);
                LogService.info("WebHandler", "_apiPostMessage - Message processed");
                response.sendStatus(200);
            }
        }).catch(err=> {
            LogService.error("WebHandler", "_apiPostMessage - Error encountered parsing message");
            LogService.error("WebHandler", err);
            response.sendStatus(500);
        });
    }

    /**
     * Renders a message
     * @param request the request
     * @param response the response
     * @private
     */
    _renderMessage(request, response) {
        LogService.info("WebHandler", "_renderMessage - Get " + request.params.id);
        this._db.getMessage(request.params.id).then(message => {
            if (message) {
                response.render("message", {title: message.subject, message: message});
            } else {
                response.status(404);
                response.render("404", {title: "404: Message Not Found"});
            }
        });
    }
}


module.exports = WebHandler;