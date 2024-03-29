# matrix-email-bot

A bot that posts messages to rooms when an email is received. Ideal for uses where a 
short message is desired in a chat room when a newsletter goes out.

Questions? Ask away in [#email:t2bot.io](https://matrix.to/#/#email:t2bot.io)

# How to use (t2bot.io hosted version)

*Note*: Currently this is in the early stages of development and is therefore somewhat 
restricted in what is possible. Future enhancements are planned to make this easier to 
use and set up.

1. Invite `@email:t2bot.io` to your [Matrix](https://matrix.org) room.
2. Get your room's internal ID (for instance, `!wpcRmAaQXqgBPdUNWo:t2l.io` which is `#email:t2bot.io`).
3. Contact `@travis:t2l.io` (via DM) to set the appropriate `allow_from` rule for your room. 
   (*This is a temporary step until [#1](https://github.com/t2bot/matrix-email-bot/issues/1) is implemented*)
4. Send an email to `<room id without !>_<domain>@email.t2bot.io` (eg: `wpcRmAaQXqgBPdUNWo_t2l.io@email.t2bot.io`).
5. See the message the bot posts (this may take a while depending on system load).

## Subscribing to mailing lists

Please reach out to `@travis:t2l.io` (via DM) to get your room mapped to a mailing list. In the future, 
this will be better and require less involvement from humans.

# Run your own

*Note*: Some experience with MX records is ideal.

The bot runs best on port 25 to receive all incoming mail to your server. The bot does not (currently) 
send mail out, but does process all inbound emails to try and get them to the proper room (letting them 
disappear if no room can be mapped).

1. Set up an MX record to point to your domain. For example, `email.t2bot.io 10 vps3.t2l.io` (`email.t2bot.io` 
   being the domain, `10` the priority, and `vps3.t2l.io` being the server's hostname)
2. Optionally install `spamassassin` and `spamc`: `sudo apt-get install spamassassin spamc` - be sure to enable them!
3. Install nodejs and npm (v14+ preferred).
4. Clone this repository and run `yarn install`.
5. Copy `config/default.yaml` to `config/production.yaml` and configure accordingly.
6. Set the environment variable `NODE_ENV` to `production` and run `yarn start`.
7. Start using your bot!

There is also a Docker image available at `t2bot/matrix-email-bot` - map your config to `/app/config/production.yaml`.

## Running with an existing mail server

*TODO: Instructions on how to set up postfix*

If mail is currently being managed for your domain, or you'd like to filter the incoming mail 
in a more intelligent manner before it reaches the bot, set `enabled` to `false` under `mail` 
in the configuration file. This will disable the default SMTP listener on the bot.

The existing mail server will need to be configured to run an external program so mail can be 
sent to the bot. Have the mail server run `node post_message.js` in the bot's directory to post 
a message from the standard input pipe. If the email is in file form, use the following syntax: 
`node post_message.js path/to/file.eml`.

## Subscribing to mailing lists

Some mailing lists require you to send an email in order to subscribe. This requires setting up a 
mailserver (such as postfix) in send-only mode because the bot is handling incoming mail. After 
setting up your mail server, use it to send an email to the list with the `From` address being the 
room you'd like to announce to. For example: 
`echo "Subscribe" | mail -s "Subscribe" mailinglist+subscribe@domain.com -aFrom:myroom_matrix.org@email.t2bot.io`

# Migration from v1

The bot now stores everything under a single configurable `storagePath`. The following should be moved there:
* `./db/attachments` -> `$storagePath/attachments`
* `./db/production.db` -> `$storagePath/emails.db`

The bot also supports encryption now: it will create a device and such all on its own. It is recommended to
log out of all access tokens for the bot and re-create one manually using a login script instead of getting
an access token from a crypto-capable client.

For operational purposes, everything under the `storagePath` should be backed up and persisted.
