var db = require("./database");
var matrix = require("./matrix");
var mailer = require("./mailer");
var web = require("./web");

db.init();
matrix.init();
mailer.init();
web.init();
