import config, { IRoomConfig } from "./config";

interface IAnnotatedRoomConfig extends IRoomConfig {
    roomId: string;
}

export function getRoomConfig(roomId: string): IAnnotatedRoomConfig {
    const defaults = config.defaultRoomConfig;
    let overrides = config.roomConfigs[roomId];
    if (!overrides) {
        return null;
    }
    return Object.assign({}, {roomId}, defaults, overrides) as IAnnotatedRoomConfig;
}

export function getRoomConfigsForTarget(emailAddress: string, source: "cc" | "bcc" | "to" | "envelope"): IAnnotatedRoomConfig[] {
    const configs: IAnnotatedRoomConfig[] = [];
    const customMapping = config.customMailTargets[emailAddress];
    if (!customMapping) {
        const domain = config.mail.domain;
        if (emailAddress.endsWith("@" + domain)) {
            const parts = emailAddress.split('@')[0].split('_');
            if (parts.length < 2) return null; // invalid address

            const roomId = `!${parts.shift()}:${parts.join('_')}`;
            configs.push(getRoomConfig(roomId));
        }
    } else {
        for (const mapped of customMapping) {
            configs.push(getRoomConfig(mapped));
        }
    }

    if (configs.length === 0) {
        return null;
    }

    const freshConfigs: IAnnotatedRoomConfig[] = [];
    for (const roomConfig of configs) {
        if (!roomConfig) continue;
        if (source === "cc" && !roomConfig.useCcAsTarget) continue;
        if (source === "bcc" && !roomConfig.useBccAsTarget) continue;
        if (source === "to" && !roomConfig.useToAsTarget) continue;
        if (source === "envelope" && !roomConfig.useEnvelopeToAsTarget) continue;
        freshConfigs.push(roomConfig);
    }

    return freshConfigs;
}
