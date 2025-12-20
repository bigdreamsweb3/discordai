// puppeteer/utils/logger.js
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'discord-bot.log');

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  // Console output
  console.log(logMessage);
  
  // File output
  try {
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (error) {
    console.error(`Failed to write to log file: ${error.message}`);
  }
}

function error(message) {
  log(message, 'ERROR');
}

function warn(message) {
  log(message, 'WARN');
}

function info(message) {
  log(message, 'INFO');
}

function debug(message) {
  log(message, 'DEBUG');
}

module.exports = {
  log,
  error,
  warn,
  info,
  debug
};