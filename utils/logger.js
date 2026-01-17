// utils/logger.js
const fs = require("fs");
const path = require("path");

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFile = path.join(logsDir, "app.log");

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [INFO] ${message}`;

  // Console output
  console.log(logMessage);

  // File output
  try {
    fs.appendFileSync(logFile, logMessage + "\n");
  } catch (error) {
    console.error("Failed to write to log file:", error.message);
  }
}

module.exports = { log };
