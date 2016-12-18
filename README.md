# matrix-email-bot
A bot that posts messages to rooms when an email is received. Ideal for uses where a short message is desired in a chat room when a newsletter goes out.

# How to use

*Note*: Currently this is in the early stages of development and is therefore somewhat restricted in what is possible. Future enhancements are planned to make this easier to use and set up.

1. Invite `@email:t2bot.io` to your [Matrix](https://matrix.org) room.
2. Get your room's internal ID (for instance, `!ooXDTgcuwbbtVkAEJL:t2bot.io`).
3. Contact `@travis:t2l.io` to set the appropriate `allow_from` rule for your room. (*This is a temporary step until [#1](https://github.com/turt2live/matrix-email-bot/issues/1) is implemented*)
4. Send an email to `<room id without !>_<domain>@email.t2bot.io` (eg: `ooXDTgcuwbbtVkAEJL_t2bot.io@email.t2bot.io`).
5. See the message the bot posts (this may take a while depending on system load).

# Run your own

*Note*: Some experience with MX records is ideal.

Currently matrix-email-bot is a single application. Future plans include making the various moving parts their own services (if desired) to distribute load.

1. Set up an MX record to point to your domain. For example, `email.t2bot.io 10 vps3.t2l.io`.
2. Install `spamassassin` and `spamc`: `sudo apt-get install spamassassin spamc`.
3. Enable spamassassin and spamc (`/etc/default/spamassassin`).
4. Install nodejs and npm (v6+ preferred).
5. Clone this repository and run `npm install`.
6. Copy `config/default.json` to `config/production.json` and configure accordingly.
7. Set the environment variable `NODE_ENV` to `production` and run `node index.js`.
8. Start using your bot!

# Security considerations

Currently the bot takes the raw email HTML and puts it into the database with basic SQL-injection avoidance. The HTML is then dumped into a templated HTML page without sanitization. It is up to the room administrators to set an appropriate `allow_from` restriction to only allow trusted senders. The service provider should take appropriate steps to reduce the chance of attack from their domain. Future updates will implement basic security checks to reduce risk of attack.
