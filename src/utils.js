var config = require("config");
var log = require("./LogService");
var extend = require("extend");

class Utils {
    static getRoomConfigsForTarget(emailAddress, source) {
        var configs = [];
        log.info("utils", "getRoomConfigsForTarget - Start lookup for " + emailAddress + " source: " + source);
        var customMapping = config.get("customMailTargets")[emailAddress];
        if (!customMapping) {
            log.info("utils", "getRoomConfigsForTarget - No custom mapping for " + emailAddress);
            var mailDomain = config.get("mail.domain");

            if (emailAddress.endsWith('@' + mailDomain)) {
                var parts = emailAddress.split('@')[0].split('_');
                if (parts.length < 2) return null; // Invalid email address

                var roomId = "!" + parts.shift() + ":" + parts.join("_");
                configs.push(Utils.getRoomConfig(roomId));
            }
        } else {
            for (var mappedRoomId of customMapping) {
                configs.push(Utils.getRoomConfig(mappedRoomId));
            }
        }

        if (configs.length == 0) {
            log.warn("utils", "getRoomConfigsForTarget - No room configs found for " + emailAddress);
            return null;
        } else log.info("utils", "getRoomConfigsForTarget - Found " + configs.length + " configurations");

        log.info("utils", "getRoomConfigsForTarget - Checking cc, bcc, and to for " + emailAddress);
        var newConfigs = [];
        for (var roomConfig of configs) {
            if (source == "cc" && !roomConfig['useCcAsTarget']) continue;
            if (source == "bcc" && !roomConfig['useBccAsTarget']) continue;
            if (source == "to" && !roomConfig['useToAsTarget']) continue;
            newConfigs.push(roomConfig); // must be safe to use at this point
        }
        configs = newConfigs;

        log.info("utils", "getRoomConfigForTarget - Sender allowed, returning " + newConfigs.length + " configs");
        return configs;
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