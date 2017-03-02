var Enum = require("es6-enum");

/**
 * Different types of messages that can be processed
 * @type {{PRIMARY: MessageType, FRAGMENT: MessageType}}
 */
const MessageType = Enum("PRIMARY", "FRAGMENT");

module.exports = MessageType;