require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const {
  DISCORD_TOKEN,
  GUILD_ID,
  CHANNEL_ID,
  MESSAGE_ID,
  ROLE_ID,
  ACTION,
  IS_POLL,
  POLL_ANSWER_ID,
} = process.env;

const requiredVars = { DISCORD_TOKEN, GUILD_ID, CHANNEL_ID, MESSAGE_ID, ROLE_ID, ACTION };
const missing = Object.entries(requiredVars)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing required .env values: ${missing.join(', ')}`);
  process.exit(1);
}

const action = ACTION.trim().toUpperCase();
if (action !== 'ADD' && action !== 'REMOVE') {
  console.error(`ACTION must be "ADD" or "REMOVE" (got "${ACTION}")`);
  process.exit(1);
}

const isPoll = (IS_POLL || '').trim().toLowerCase() === 'true';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logResult(rows) {
  const added = rows.filter((r) => r.status === 'added').length;
  const removed = rows.filter((r) => r.status === 'removed').length;
  const skipped = rows.filter((r) => r.status.startsWith('skipped')).length;
  const failed = rows.filter((r) => r.status === 'failed').length;

  console.log('\n--- Summary --------------------------------------------');
  rows.forEach((r) => {
    console.log(`${r.status.padEnd(22)} ${r.tag} (${r.id})${r.reason ? ' - ' + r.reason : ''}`);
  });
  console.log('----------------------------------------------------------');
  console.log(`Total processed: ${rows.length} | added: ${added} | removed: ${removed} | skipped: ${skipped} | failed: ${failed}`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
});

async function collectReactionUserIds(message) {
  const userIds = new Set();

  for (const [, reaction] of message.reactions.cache) {
    let users;
    try {
      users = await reaction.users.fetch();
    } catch (err) {
      console.warn(`Could not fetch users for reaction ${reaction.emoji}: ${err.message}`);
      continue;
    }
    users.forEach((u) => {
      if (!u.bot) userIds.add(u.id);
    });
  }

  return userIds;
}

async function collectPollVoterIds(message) {
  const userIds = new Set();

  if (!message.poll) {
    console.error('IS_POLL=true but the target message has no poll attached.');
    return userIds;
  }

  const answers = POLL_ANSWER_ID
    ? [message.poll.answers.get(POLL_ANSWER_ID)].filter(Boolean)
    : [...message.poll.answers.values()];

  if (POLL_ANSWER_ID && answers.length === 0) {
    console.error(`POLL_ANSWER_ID "${POLL_ANSWER_ID}" was not found on this poll's answers.`);
  }

  for (const answer of answers) {
    let voters;
    try {
      voters = await answer.fetchVoters();
    } catch (err) {
      console.warn(`Could not fetch voters for answer "${answer.text}": ${err.message}`);
      continue;
    }
    voters.forEach((u) => {
      if (!u.bot) userIds.add(u.id);
    });
  }

  return userIds;
}

async function run() {
  console.log(`Logging in...`);
  await client.login(DISCORD_TOKEN);

  console.log(`Fetching guild ${GUILD_ID}...`);
  const guild = await client.guilds.fetch(GUILD_ID);

  console.log(`Fetching role ${ROLE_ID}...`);
  const role = await guild.roles.fetch(ROLE_ID);
  if (!role) {
    console.error(`Role ${ROLE_ID} not found in guild ${GUILD_ID}.`);
    process.exit(1);
  }

  console.log(`Fetching channel ${CHANNEL_ID}...`);
  const channel = await guild.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    console.error(`Channel ${CHANNEL_ID} not found or is not a text channel.`);
    process.exit(1);
  }

  console.log(`Fetching message ${MESSAGE_ID}...`);
  const message = await channel.messages.fetch(MESSAGE_ID);
  if (!message) {
    console.error(`Message ${MESSAGE_ID} not found in channel ${CHANNEL_ID}.`);
    process.exit(1);
  }

  console.log(`Mode: ${isPoll ? 'POLL' : 'REACTION'} | Action: ${action}`);

  const userIds = isPoll
    ? await collectPollVoterIds(message)
    : await collectReactionUserIds(message);

  console.log(`Found ${userIds.size} unique non-bot user(s) to process.`);

  if (userIds.size === 0) {
    console.log('Nothing to do. Exiting.');
    await client.destroy();
    return;
  }

  const rows = [];

  for (const userId of userIds) {
    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch (err) {
      rows.push({ id: userId, tag: 'unknown (left server?)', status: 'failed', reason: err.message });
      continue;
    }

    const hasRole = member.roles.cache.has(role.id);

    try {
      if (action === 'ADD') {
        if (hasRole) {
          rows.push({ id: userId, tag: member.user.tag, status: 'skipped (already has role)' });
        } else {
          await member.roles.add(role, 'Reaction/poll role script - ADD');
          rows.push({ id: userId, tag: member.user.tag, status: 'added' });
        }
      } else {
        if (!hasRole) {
          rows.push({ id: userId, tag: member.user.tag, status: "skipped (didn't have role)" });
        } else {
          await member.roles.remove(role, 'Reaction/poll role script - REMOVE');
          rows.push({ id: userId, tag: member.user.tag, status: 'removed' });
        }
      }
    } catch (err) {
      rows.push({ id: userId, tag: member.user.tag, status: 'failed', reason: err.message });
    }

    await sleep(300);
  }

  logResult(rows);

  await client.destroy();
  console.log('Done. Client disconnected.');
}

run().catch(async (err) => {
  console.error('Fatal error:', err);
  try {
    await client.destroy();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
