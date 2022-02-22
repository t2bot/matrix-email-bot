import * as Database from "better-sqlite3";
import * as uuid from "uuid";
import * as path from "path";
import * as fs from "fs";

export interface IDbMessage {
    email_id: string;
    from_name: string;
    from_email: string;
    to_name: string;
    to_email: string;
    subject: string;
    text_body: string;
    html_body: string;
    full_text_body: string;
    is_html: boolean;
    target_room: string;
}

export interface IDbAttachment {
    name: string;
    content: any;
    post: boolean;
    type: string;
}

export class DataStore {
    private db: Database.Database;

    private selectByEmailId: Database.Statement;
    private selectById: Database.Statement;
    private insertMessage: Database.Statement;
    private insertAttachment: Database.Statement;

    public constructor(path: string, private fsPath: string) {
        this.db = new Database(path);
        this.db.exec("CREATE TABLE IF NOT EXISTS emails (id VARCHAR NULL PRIMARY KEY, email_id VARCHAR NULL, from_email VARCHAR NULL, from_name VARCHAR NULL, to_email VARCHAR NULL, to_name VARCHAR NULL, subject VARCHAR NULL, text_body VARCHAR NULL, html_body VARCHAR NULL, is_html BOOLEAN NULL, received_timestamp TIMESTAMP NULL, target_room VARCHAR NULL, full_text_body VARCHAR NULL)");
        this.db.exec("CREATE TABLE IF NOT EXISTS attachments (id VARCHAR NULL PRIMARY KEY, email_id VARCHAR NULL, file_name VARCHAR NULL, content_type VARCHAR NULL)");

        this.selectByEmailId = this.db.prepare("SELECT * FROM emails WHERE email_id = @messageId");
        this.selectById = this.db.prepare("SELECT * FROM emails WHERE id = @id");
        this.insertMessage = this.db.prepare("INSERT INTO emails (id, email_id, from_email, from_name, to_email, to_name, subject, text_body, html_body, is_html, received_timestamp, target_room, full_text_body) VALUES (@id, @email_id, @from_email, @from_name, @to_email, @to_name, @subject, @text_body, @html_body, @is_html, @received_timestamp, @target_room, @full_text_body)");
        this.insertAttachment = this.db.prepare("INSERT INTO attachments (id, email_id, file_name, content_type) VALUES (@id, @email_id, @file_name, @content_type)");
    }

    public async doesMessageExist(messageId: string): Promise<boolean> {
        return !!(this.selectByEmailId.get({messageId}));
    }

    public async getMessage(id: string): Promise<IDbMessage> {
        const res = this.selectById.get({id});
        if (res) {
            return {
                ...res,
                is_html: Boolean(res.is_html),
            };
        }
        return null;
    }

    public async writeMessage(message: IDbMessage): Promise<string> {
        const id = uuid.v4();
        this.insertMessage.run({
            ...message,
            is_html: message.is_html ? 1 : 0,
            html_body: message.html_body ? message.html_body : "",
            id: id,
            received_timestamp: Date.now(),
        });
        return id;
    }

    public async writeAttachments(attachments: IDbAttachment[], messageId: string) {
        for (const attachment of attachments) {
            const id = uuid.v4();
            const target = path.join(this.fsPath, id + ".attachment");
            await fs.promises.writeFile(target, attachment.content);
            this.insertAttachment.run({
                id, email_id: messageId,
                file_name: attachment.name,
                content_type: attachment.type,
            });
        }
    }
}
