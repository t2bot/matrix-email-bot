var config = require("config");
var log = require("npmlog");
var extend = require("extend");

class Utils {
    static getRoomConfigForTarget(emailAddress, source) {
        log.info("utils", "getRoomConfigForTarget - Start lookup for " + emailAddress + " source: " + source);
        var roomConfig = null;
        var customMapping = config.get("customMailTargets")[emailAddress];
        if (!customMapping) {
            log.info("utils", "getRoomConfigForTarget - No custom mapping for " + emailAddress);
            var mailDomain = config.get("mail.domain");

            if (emailAddress.endsWith('@' + mailDomain)) {
                var parts = emailAddress.split('@')[0].split('_');
                if (parts.length < 2) return null; // Invalid email address

                var roomId = "!" + parts.shift() + ":" + parts.join("_");
                roomConfig = Utils.getRoomConfig(roomId);
            }
        } else roomConfig = Utils.getRoomConfig(roomConfig);

        if (!roomConfig) {
            log.warn("utils", "getRoomConfigForTarget - No room config found for " + emailAddress);
            return null;
        }

        log.info("utils", "getRoomConfigForTarget - Checking cc, bcc, and to for " + emailAddress);
        if (source == "cc" && !roomConfig['useCcAsTarget']) return null;
        if (source == "bcc" && !roomConfig['useBccAsTarget']) return null;
        if (source == "to" && !roomConfig['useToAsTarget']) return null;

        log.info("utils", "getRoomConfigForTarget - Sender allowed, returning config for room " + roomConfig.roomId);
        return roomConfig;
    }

    static getRoomConfig(roomId) {
        log.info("utils", "getRoomConfig - Lookup " + roomId);
        var defaults = config.get("defaultRoomConfig");
        var overrides = config.get("roomConfigs")[roomId];
        if (!overrides) {
            log.warn("utils", "getRoomConfig - No configuration for room " + roomId);
            return null;
        }

        // HACK: Double-extend due to weird behaviour in config's extendDeep call
        return extend(true, {roomId: roomId}, defaults, overrides);
    }
}

module.exports = Utils;