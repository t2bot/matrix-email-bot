const winston = require("winston");
const chalk = require("chalk");
const config = require("config");
const fs = require('fs');
const moment = require('moment');

try {
    fs.mkdirSync('logs')
} catch (err) {
    if (err.code !== 'EEXIST') throw err
}

const TERM_COLORS = {
    error: "red",
    warn: "yellow",
    info: "blue",
    verbose: "white",
    silly: "grey",
};

function winstonColorFormatter(options) {
    options.level = chalk[TERM_COLORS[options.level]](options.level);
    return winstonFormatter(options);
}

function winstonFormatter(options) {
    return options.timestamp() + ' ' + options.level + ' ' + (options.message ? options.message : '') +
        (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '' );
}

function getTimestamp() {
    return moment().format('MMM-D-YYYY HH:mm:ss.SSS Z');
}

const loggingConfig = config.get('logging');

const transports = [];
transports.push(new (winston.transports.File)({
    json: false,
    name: "file",
    filename: loggingConfig.file,
    timestamp: getTimestamp,
    formatter: winstonFormatter,
    level: loggingConfig.fileLevel,
    maxsize: loggingConfig.rotate.size,
    maxFiles: loggingConfig.rotate.count,
    zippedArchive: false
}));

if (loggingConfig.console) {
    transports.push(new (winston.transports.Console)({
        json: false,
        name: "console",
        timestamp: getTimestamp,
        formatter: winstonColorFormatter,
        level: loggingConfig.consoleLevel
    }));
}

const log = new winston.Logger({
    transports: transports,
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        verbose: 3,
        silly: 4
    }
});

function doLog(level, module, messageOrObject) {
    if (typeof(messageOrObject) === 'object' && !(messageOrObject instanceof Error))
        messageOrObject = JSON.stringify(messageOrObject);

    if (messageOrObject instanceof Error) {
        const err = messageOrObject;
        messageOrObject = err.message + "\n" + err.stack;
    }

    const message = "[" + module + "] " + messageOrObject;
    log.log(level, message);
}

class LogService {
    static info(module, message) {
        doLog('info', module, message);
    }

    static warn(module, message) {
        doLog('warn', module, message);
    }

    static error(module, message) {
        doLog('error', module, message);
    }

    static verbose(module, message) {
        doLog('verbose', module, message);
    }

    static silly(module, message) {
        doLog('silly', module, message);
    }
}

module.exports = LogService;
