const config = require("config");
const log = require("./LogService");
const extend = require("extend");

class Utils {
    static getRoomConfigsForTarget(emailAddress, source) {
        let configs = [];
        log.info("utils", "getRoomConfigsForTarget - Start lookup for " + emailAddress + " source: " + source);
        let customMapping = config.get("customMailTargets")[emailAddress];
        if (!customMapping) {
            log.info("utils", "getRoomConfigsForTarget - No custom mapping for " + emailAddress);
            const mailDomain = config.get("mail.domain");

            if (emailAddress.endsWith('@' + mailDomain)) {
                const parts = emailAddress.split('@')[0].split('_');
                if (parts.length < 2) return null; // Invalid email address

                const roomId = "!" + parts.shift() + ":" + parts.join("_");
                configs.push(Utils.getRoomConfig(roomId));
            }
        } else {
            for (let mappedRoomId of customMapping) {
                configs.push(Utils.getRoomConfig(mappedRoomId));
            }
        }

        if (configs.length === 0) {
            log.warn("utils", "getRoomConfigsForTarget - No room configs found for " + emailAddress);
            return null;
        } else log.info("utils", "getRoomConfigsForTarget - Found " + configs.length + " configurations");

        log.info("utils", "getRoomConfigsForTarget - Checking cc, bcc, and to for " + emailAddress);
        const newConfigs = [];
        for (let roomConfig of configs) {
            if (source === "cc" && !roomConfig['useCcAsTarget']) continue;
            if (source === "bcc" && !roomConfig['useBccAsTarget']) continue;
            if (source === "to" && !roomConfig['useToAsTarget']) continue;
            newConfigs.push(roomConfig); // must be safe to use at this point
        }
        configs = newConfigs;

        log.info("utils", "getRoomConfigForTarget - Sender allowed, returning " + newConfigs.length + " configs");
        return configs;
    }

    static getRoomConfig(roomId) {
        log.info("utils", "getRoomConfig - Lookup " + roomId);
        const defaults = config.get("defaultRoomConfig");
        let overrides = config.get("roomConfigs")[roomId];
        if (!overrides) {
            log.warn("utils", "getRoomConfig - No configuration for room " + roomId);
            return null;
        }

        // HACK: Double-extend due to weird behaviour in config's extendDeep call
        return extend(true, {roomId: roomId}, defaults, overrides);
    }
}

module.exports = Utils;