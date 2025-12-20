// discord/bot.js  (or wherever you set up the bot)

const { Client, IntentsBitField } = require("discord.js");
const { log } = require("../utils/logger"); // adjust path if needed
const { OWNER_ID } = require("../config/env");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// Early validation
if (!DISCORD_TOKEN) {
  log("ERROR: DISCORD_TOKEN is missing in .env");
  process.exit(1);
}

// Create the client instance
const client = new Client({
  intents: [IntentsBitField.Flags.DirectMessages],
});

// Optional: Store owner ID for easy access later
client.ownerId = OWNER_ID; // Now you can do client.ownerId anywhere after login

client.once("clientReady", (readyClient) => {
  log(`Bot logged in and ready as ${readyClient.user.tag}`);

  // Optional: Fetch application owner if you want the actual app owner
  readyClient.application
    ?.fetch()
    .then((app) => {
      client.ownerId = app.owner.id; // Override with real owner if needed
      log(`Bot application owner: ${app.owner.tag} (${client.ownerId})`);
    })
    .catch(() => {});
});

// Login
client.login(DISCORD_TOKEN).catch((err) => {
  log(`Failed to login bot: ${err.message}`);
  process.exit(1);
});

// Export the client instance
module.exports = { discordBotClient: client };
