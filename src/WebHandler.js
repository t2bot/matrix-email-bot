var express = require('express');
var config = require("config");
var log = require("npmlog");

/**
 * Handles web requests
 */
class WebHandler {

    /**
     * Creates a new web handler backed by a given datastore
     * @param {DataStore} db the datastore to back the web handler with
     */
    constructor(db) {
        this._db = db;
        this._app = express();

        this._app.get("/_m.email/api/v1/message/:id", function (request, response) {
            this._apiGetMessage(request, response);
        }.bind(this));

        this._app.get("/m/:id", function (request, response) {
            this._renderMessage(request, response);
        }.bind(this));

        this._app.set("view engine", "pug");
        this._app.listen(config.get("web.port"), config.get("web.bindIp"));

        log.info("WebHandler", "Listening on " + config.get("web.bindIp") + ":" + config.get("web.port"));
    }

    /**
     * API endpoint for getting a message (JSON)
     * @param request the request
     * @param response the response
     * @private
     */
    _apiGetMessage(request, response) {
        log.info("WebHandler", "_apiGetMessage - Get " + request.params.id);
        this._db.getMessage(request.params.id).then(message => {
            if (message) {
                message.email_id = undefined; // redact message id from result
                response.setHeader("Content-Type", "application/json");
                response.send(JSON.stringify(message));
            } else response.send(404);
        });
    }

    /**
     * Renders a message
     * @param request the request
     * @param response the response
     * @private
     */
    _renderMessage(request, response) {
        log.info("WebHandler", "_renderMessage - Get " + request.params.id);
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