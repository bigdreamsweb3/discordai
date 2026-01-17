// config/env.js
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const required = [
  "DISCORD_EMAIL",
  "DISCORD_PASSWORD",
  "DISCORD_TOKEN",
  "OWNER_ID",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Default channels (fallback)
let CHANNEL_URLS = [
  // "https://discord.com/channels/1451532169695727799/1451532170572206155",
  // "https://discord.com/channels/231471142685245440/1092560565626474517",
];

// Load from channels.json if exists
const channelsFile = path.join(__dirname, "channels.json");
if (fs.existsSync(channelsFile)) {
  try {
    const data = fs.readFileSync(channelsFile, "utf-8");
    const saved = JSON.parse(data);
    if (Array.isArray(saved) && saved.length > 0) {
      CHANNEL_URLS = saved;
    }
  } catch (e) {
    console.error("Failed to load channels.json, using defaults:", e.message);
  }
}

// Function to save channels persistently
function saveChannels(urls) {
  try {
    fs.writeFileSync(channelsFile, JSON.stringify(urls, null, 2));
    console.log("Channels saved to channels.json");
  } catch (e) {
    console.error("Failed to save channels:", e.message);
  }
}

module.exports = {
  DISCORD_EMAIL: process.env.DISCORD_EMAIL,
  DISCORD_PASSWORD: process.env.DISCORD_PASSWORD,
  CHANNEL_URLS,
  saveChannels, // ← This is required!
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  OWNER_ID: process.env.OWNER_ID,
  REPORT_CHANNEL_ID: process.env.REPORT_CHANNEL_ID,
};
