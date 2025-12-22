// utils/directories.js

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

// Base directories in userData (writable & persistent)
const baseDir = app.getPath("userData"); // e.g., %APPDATA%/DCAI on Windows

const screenshotsDir = path.join(baseDir, "screenshots");
const profileScreenshotsDir = path.join(
  screenshotsDir,
  "discovered_new_profile"
);
const logsDir = path.join(baseDir, "logs");

// Create all directories if they don't exist
[screenshotsDir, profileScreenshotsDir, logsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

module.exports = {
  screenshotsDir,
  profileScreenshotsDir, // renamed for consistency
  logsDir,
};
