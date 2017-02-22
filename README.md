# matrix-email-bot
A bot that posts messages to rooms when an email is received. Ideal for uses where a short message is desired in a chat room when a newsletter goes out.

# How to use

*Note*: Currently this is in the early stages of development and is therefore somewhat restricted in what is possible. Future enhancements are planned to make this easier to use and set up.

1. Invite `@email:t2bot.io` to your [Matrix](https://matrix.org) room.
2. Get your room's internal ID (for instance, `!ooXDTgcuwbbtVkAEJL:t2bot.io` which is `#test:t2bot.io`).
3. Contact `@travis:t2l.io` to set the appropriate `allow_from` rule for your room. (*This is a temporary step until [#1](https://github.com/turt2live/matrix-email-bot/issues/1) is implemented*)
4. Send an email to `<room id without !>_<domain>@email.t2bot.io` (eg: `ooXDTgcuwbbtVkAEJL_t2bot.io@email.t2bot.io`).
5. See the message the bot posts (this may take a while depending on system load).

# Run your own

*Note*: Some experience with MX records is ideal.

Currently matrix-email-bot is a single application that listens on port 25 for any incoming mail and processes it on it's own, (so you can only run the bot on a server where no mailserver is running). Future plans include making the various moving parts their own services (if desired) to distribute load.

1. Set up an MX record to point to your domain. For example, `email.t2bot.io 10 vps3.t2l.io` (where `email.t2bot.io` is the domain, that is used by the bot as domain part of the email and `vps3.t2l.io` is the domain of the server the bot is runing on.)
2. Optionally install `spamassassin` and `spamc`: `sudo apt-get install spamassassin spamc` and enable spamassassin and spamc (`/etc/default/spamassassin`).
4. Install nodejs and npm (v6+ preferred).
5. Clone this repository and run `npm install`.
6. Copy `config/default.yaml` to `config/production.yaml` and configure accordingly.
7. Set the environment variable `NODE_ENV` to `production` and run `node index.js`.
8. Start using your bot!

# Security considerations

Currently the bot does some sanitizing on the email received. However, it still ends up going through `node-sqlite` (or whatever storage backend) which may not completely avoid SQL-injection or similar attacks. **Room administrators are expected to set the appropriate restrictions on their rooms to only allow trusted senders and content.** The bot also does some sanitizing of the HTML body before storing it to reduce the chance of XSS or similar attacks when sending the email to Matrix or web browser for viewing. Matrix clients (such as Riot) are expected to process that HTML further if desired. For instance, the bot currently allows `h1` and `h2` tags, Riot does not and therefore Riot is responsible for removing those tags.
