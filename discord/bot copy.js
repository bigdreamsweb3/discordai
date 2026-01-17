const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { log } = require("../utils/logger");
const { OWNER_ID } = require("../config/env");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  log("ERROR: DISCORD_TOKEN is missing in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // <--- CRITICAL: This allows the bot to see servers
    GatewayIntentBits.GuildMessages, // <--- CRITICAL: This allows the bot to send messages
    GatewayIntentBits.MessageContent, // <--- CRITICAL: Required to read message data
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.ownerId = OWNER_ID;

client.once("ready", (readyClient) => {
  // This will now show the correct count instead of 0
  log(`✅ Bot online: ${readyClient.user.tag}`);
  log(`📊 Connected to ${readyClient.guilds.cache.size} server(s)`);

  // List names of servers it can see
  readyClient.guilds.cache.forEach((guild) => {
    log(`🏠 Server Name: ${guild.name} | ID: ${guild.id}`);
  });
});

client.login(DISCORD_TOKEN).catch((err) => {
  log(`Failed to login bot: ${err.message}`);
  process.exit(1);
});

module.exports = { discordBotClient: client };
