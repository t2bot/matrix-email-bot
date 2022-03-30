import * as config from "config";

export interface IRoomConfig {
    allowFromAnyone: boolean;
    allowedSenders: string[];
    blockedSenders: string[];
    skipDatabase: boolean;
    useCcAsTarget: boolean;
    useBccAsTarget: boolean;
    useToAsTarget: boolean;
    useEnvelopeToAsTarget: boolean;
    plaintextOnly: boolean;
    attachments: {
        post: boolean;
        allowAllTypes: boolean;
        contentMapping: Map<string, string>; // mime to msgtype
        allowedTypes: string[];
        blockedTypes: string[];
    };
    postReplies: boolean;
    messageFormat: string;
    fragmentFormat: string;
    messagePlainFormat: string;
    fragmentPlainFormat: string;
    antispam: {
        maxScore: number;
        blockFailedDkim: boolean;
        blockFailedSpf: boolean;
    };
}

interface IConfig {
    matrix: {
        homeserverUrl: string;
        accessToken: string;
        storagePath: string;
    };
    mail: {
        enabled: boolean;
        port: number;
        domain: string;
    };
    web: {
        port: number;
        bindIp: string;
        secret: string;
    };
    customMailTargets: Map<string, string[]>; // emails to room IDs
    defaultRoomConfig: IRoomConfig;
    roomConfigs: Map<string, IRoomConfig>; // room ID to config
}

export default <IConfig>config;
