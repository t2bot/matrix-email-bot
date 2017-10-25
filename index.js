const DataStore = require("./src/DataStore");
const EmailHandler = require("./src/EmailHandler");
const MatrixHandler = require("./src/MatrixHandler");
const WebHandler = require("./src/WebHandler");
const log = require("./src/LogService");

log.info("index", "Creating and preparing database");

// Start the database
const db = new DataStore();
db.prepare().then(() => {
    log.info("index", "Starting matrix handler");
    // Create the matrix handler
    const matrix = new MatrixHandler();

    // start the email handler
    log.info("index", "Starting email handler");
    const emailHandler = new EmailHandler(matrix, db);

    // start the web handler (variable not needed)
    log.info("index", "Starting web handler");
    new WebHandler(db, emailHandler);
}, err=> {
    log.error("index", "Error preparing database");
    log.error("index", err);
});