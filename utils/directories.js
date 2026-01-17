// utils/directories.js

const path = require("path");
const fs = require("fs");

// Detect if we're running in Electron (main process)
let isElectron = false;
let app = null;

try {
  // This will only succeed in Electron main process
  const electron = require("electron");
  app = electron.app || electron.remote?.app; // Support both old and new Electron
  isElectron = !!app;
} catch (e) {
  // Not in Electron — safe to ignore
}

// Fallback for development (when running node index.js or tests)
const baseDir = isElectron
  ? app.getPath("userData") // e.g., %APPDATA%/DCAI
  : path.join(process.cwd(), ".dev-data"); // Local folder in project root for dev

// Create base dir if needed
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

const screenshotsDir = path.join(baseDir, "screenshots");
const profileScreenshotsDir = path.join(
  screenshotsDir,
  "discovered_new_profile"
);
const logsDir = path.join(baseDir, "logs");

// Create directories
[screenshotsDir, profileScreenshotsDir, logsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

console.log(`Data directories ready at: ${baseDir}`);

module.exports = {
  screenshotsDir,
  profileScreenshotsDir,
  logsDir,
  baseDir, // Optional: expose if needed
};
