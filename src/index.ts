import {
    AutojoinRoomsMixin,
    LogLevel,
    LogService,
    MatrixClient,
    RichConsoleLogger,
    SimpleFsStorageProvider,
    SimpleRetryJoinStrategy,
} from "matrix-bot-sdk";
import config from "./config";
import * as path from "path";
import { DataStore } from "./DataStore";
import { SqliteCryptoStorageProvider } from "matrix-bot-sdk/lib/storage/SqliteCryptoStorageProvider";
import { MatrixBot } from "./MatrixBot";
import * as fs from "fs";
import { EmailProcessor } from "./EmailProcessor";
import { WebServer } from "./WebServer";

LogService.setLevel(LogLevel.TRACE);
LogService.setLogger(new RichConsoleLogger());
LogService.muteModule("Metrics");
LogService.trace = LogService.debug;

const client = new MatrixClient(
    config.matrix.homeserverUrl,
    config.matrix.accessToken,
    new SimpleFsStorageProvider(path.join(config.matrix.storagePath, "bot.json")),
    new SqliteCryptoStorageProvider(path.join(config.matrix.storagePath, "crypto.db")),
);
AutojoinRoomsMixin.setupOnClient(client);

client.setJoinStrategy(new SimpleRetryJoinStrategy());

const attachmentsPath = path.join(config.matrix.storagePath, "attachments");
if (!fs.existsSync(attachmentsPath)) {
    fs.mkdirSync(attachmentsPath);
}

const db = new DataStore(path.join(config.matrix.storagePath, "emails.db"), attachmentsPath);
const bot = new MatrixBot(client);
const email = new EmailProcessor(bot, db);
new WebServer(db, email);

client.start().then(() => LogService.info("index", "Bot started"));
