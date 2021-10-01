import { DataStore } from "./storage/DataStore";
import { EmailProcessor } from "./EmailProcessor";
import { Express } from "express";
import * as express from "express";
import config from "./config";
import { simpleParser } from "mailparser";

export class WebServer {
    private app: Express;

    public constructor(private db: DataStore, private emailHandler: EmailProcessor) {
        this.app = express();
        this.app.use((req, res, next) => {
            if (req.is('text/*')) {
                (<any>req).text = '';
                req.setEncoding('utf8');
                req.on('data', chunk => (<any>req).text += chunk);
                req.on('end', next);
            } else {
                next();
            }
        });

        this.app.get('/_m.email/api/v1/message/:id', async (req, res) => {
            const message = await this.db.getMessage(req.params.id);
            if (message) {
                res.json(message);
            } else {
                res.sendStatus(404);
            }
        });
        this.app.post('/_m.email/api/v1/message', async (req, res) => {
            if (req.query.secret !== config.web.secret) {
                return res.sendStatus(401);
            }

            try {
                const mailbody = (<any>req).text;
                const mail = await simpleParser(mailbody);
                if (!mail || !mail.messageId) {
                    return res.sendStatus(500);
                }

                mail.to = mail.to.value;
                mail.from = mail.from.value;
                mail.cc = (mail.cc || {value: []}).value;
                mail.bcc = (mail.bcc || {value: []}).value;

                await this.emailHandler.processMessage(mail);
                res.sendStatus(200);
            } catch (e) {
                res.sendStatus(500);
            }
        });
        this.app.get('/m/:id', async (req, res) => {
            const message = await this.db.getMessage(req.params.id);
            if (message) {
                res.render('message', {title: message.subject, message: message});
            } else {
                res.sendStatus(404);
            }
        });

        this.app.set('view engine', 'pug');
        this.app.listen(config.web.port, config.web.bindIp);
    }


}
