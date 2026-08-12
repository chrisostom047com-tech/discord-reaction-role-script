# Discord Reaction/Poll Role Script

A one-shot command-line script that adds or removes a Discord role from users
who reacted to a specific message, or who voted on a Discord poll. It is **not**
a persistent bot, it logs in, performs the requested action, prints a summary,
and exits.

## Requirements

- Node.js 18+ and npm
- A Discord bot application (created via the Discord Developer Portal)
- The bot must be invited to your server with these permissions: Manage Roles, View Channels, Read Message History
- The bot's role must be positioned above the target role in Server Settings -> Roles
- The Server Members Intent must be enabled for the bot in the Developer Portal

## Setup

### 1. Create a Discord bot

1. Go to https://discord.com/developers/applications and create an application
2. Bot tab -> Reset Token -> copy the token, keep it secret
3. Under Privileged Gateway Intents, enable Server Members Intent
4. OAuth2 -> URL Generator, check bot scope, and under Bot Permissions check Manage Roles, View Channels, Read Message History
5. Open the generated URL, select your server, authorize the bot
6. In Server Settings -> Roles, drag the bot's role above the role you want the script to manage

### 2. Get the required IDs

Enable Developer Mode in Discord (User Settings -> Advanced -> Developer Mode), then:

- Server ID: right-click the server icon -> Copy Server ID
- Channel ID: right-click the channel containing the target message -> Copy Channel ID
- Message ID: right-click the target message -> Copy Message ID
- Role ID: Server Settings -> Roles -> right-click the target role -> Copy Role ID

### 3. Install

npm install
cp .env.example .env

Edit .env and fill in the values: DISCORD_TOKEN, GUILD_ID, CHANNEL_ID, MESSAGE_ID, ROLE_ID, ACTION (ADD or REMOVE), IS_POLL (true or false), POLL_ANSWER_ID (optional)

### 4. Run

node index.js

The script will log in, fetch the guild/role/channel/message, collect the unique non-bot users who reacted (or voted on the poll), add or remove the role accordingly, print a summary, then disconnect and exit.

## Edge case handling

- User already has the role (ADD): skipped, logged as "already has role", no error
- User doesn't have the role (REMOVE): skipped, logged as "didn't have role", no error
- Bots that reacted or voted: automatically excluded
- User left the server: logged as failed with the reason, script continues with remaining users
- Rate limits: a 300ms delay is added between each role operation

## Security

- Never commit your .env file, it contains your bot token
- .env.example is provided as a template with no real values

## Project structure

index.js is the main script, package.json holds dependencies, .env.example is the config template, README.md is this file.

## Design notes

A few implementation choices worth explaining:

- The script uses a one-shot discord.js Client rather than a persistent
  bot process, per the bounty requirement. It logs in, does the work, and
  calls client.destroy() before exiting, so nothing lingers in memory.
- ADD and REMOVE both check the user's current role state first, so re-running
  the script is always safe (idempotent) and never throws on users who
  already have or already lack the role.
- Poll support treats "no POLL_ANSWER_ID" as "count every answer's voters",
  since most real use cases care about anyone who voted, not one specific
  answer. Restricting to a single answer is opt-in.
- Bots are excluded from the reaction/vote count by default, since giving
  a role to a bot account is rarely the intent.
- Rate limiting is handled with a fixed small delay rather than a retry loop,
  since the expected batch size for this kind of role sync is small enough
  that a simple delay is more predictable than exponential backoff.
