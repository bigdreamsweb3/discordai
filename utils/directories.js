// utils/directories.js
const fs = require("fs");
const path = require("path");

const screenshotsDir = path.join(__dirname, "..", "screenshots");

const profilescreenshotsDir = path.join(
  __dirname,
  "..",
  "/screenshots/discovered_new_profile/"
);
const logsDir = path.join(__dirname, "..", "logs");

if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

module.exports = { screenshotsDir, profilescreenshotsDir, logsDir };
