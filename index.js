var DataStore = require("./src/DataStore");
var EmailHandler = require("./src/EmailHandler");
var MatrixHandler = require("./src/MatrixHandler");
var WebHandler = require("./src/WebHandler");
var log = require("npmlog");

log.info("index", "Creating and preparing database");

// Start the database
var db = new DataStore();
db.prepare().then(() => {
    log.info("index", "Starting matrix handler");
    // Create the matrix handler
    var matrix = new MatrixHandler();

    // start the web handler (variable not needed)
    log.info("index", "Starting web handler");
    new WebHandler(db);

    // start the email handler (variable not needed)
    log.info("index", "Starting email handler");
    new EmailHandler(matrix, db);
}, err=> {
    log.error("index", "Error preparing database");
    log.error("index", err);
});