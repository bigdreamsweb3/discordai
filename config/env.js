// config/env.js
require("dotenv").config();

const required = [
  "DISCORD_EMAIL",
  "DISCORD_PASSWORD",
  "DISCORD_CHANNEL_URL",
  "DISCORD_TOKEN",
  "OWNER_ID",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  EMAIL: process.env.DISCORD_EMAIL,
  PASSWORD: process.env.DISCORD_PASSWORD,
  CHANNEL_URL: process.env.DISCORD_CHANNEL_URL,
  CHANNEL_URLS: [
    "https://discord.com/channels/1451532169695727799/1451532170572206155",
    "https://discord.com/channels/231471142685245440/1092560565626474517",
    // "https://discord.com/channels/231471142685245440/1092560565626474517",
    // Add as many as you want
  ],
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  OWNER_ID: process.env.OWNER_ID,
};
