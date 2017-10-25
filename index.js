const DataStore = require("./src-old/DataStore");
const EmailHandler = require("./src-old/EmailHandler");
const MatrixHandler = require("./src-old/MatrixHandler");
const WebHandler = require("./src-old/WebHandler");
import LogService from "matrix-js-snippets/lib/LogService";

LogService.info("index", "Creating and preparing database");

// Start the database
const db = new DataStore();
db.prepare().then(() => {
    LogService.info("index", "Starting matrix handler");
    // Create the matrix handler
    const matrix = new MatrixHandler();

    // start the email handler
    LogService.info("index", "Starting email handler");
    const emailHandler = new EmailHandler(matrix, db);

    // start the web handler (variable not needed)
    LogService.info("index", "Starting web handler");
    new WebHandler(db, emailHandler);
}, err=> {
    LogService.error("index", "Error preparing database");
    LogService.error("index", err);
});