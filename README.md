# matrix-email-bot

A bot that posts messages to rooms when an email is received. Ideal for uses where a 
short message is desired in a chat room when a newsletter goes out.

# Run your own

*Note*: Some experience with MX records is ideal.

The bot runs best on port 25 to receive all incoming mail to your server. The bot does not (currently) 
send mail out, but does process all inbound emails to try and get them to the proper room (letting them 
disappear if no room can be mapped).

1. Set up an MX record to point to your domain. For example, `email.example.com 10 vps3.example.com` (`email.example.com` 
   being the domain, `10` the priority, and `vps3.example.com` being the server's hostname)
2. Optionally install `spamassassin` and `spamc`: `sudo apt-get install spamassassin spamc` - be sure to enable them!
3. Install nodejs and npm (v18+ preferred).
4. Clone this repository and run `yarn install`.
5. Copy `config/default.yaml` to `config/production.yaml` and configure accordingly.
6. Set the environment variable `NODE_ENV` to `production` and run `yarn start`.
7. Start using your bot!

There is also a Docker image available at `darkdecoy/matrix-email-bot` - map your config to `/app/config/production.yaml`.

## Subscribing to mailing lists

Some mailing lists require you to send an email in order to subscribe. This requires setting up a 
mailserver (such as postfix) in send-only mode because the bot is handling incoming mail. After 
setting up your mail server, use it to send an email to the list with the `From` address being the 
room you'd like to announce to. For example: 
`echo "Subscribe" | mail -s "Subscribe" mailinglist+subscribe@domain.com -aFrom:myroom_matrix.org@email.example.com`

#  Credits
* Forked from [t2bot/matrix-email-bot](https://github.com/t2bot/matrix-email-bot)