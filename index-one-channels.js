// index-one-channels.js
const { log } = require("./utils/logger");
const { launchBrowser, closeBrowser } = require("./puppeteer/browser");
const { ensureAuthenticated } = require("./puppeteer/discordAuth");
const { navigateToChannel } = require("./puppeteer/navigate");
const { startAdvancedMonitoring } = require("./monitor");

const { CHANNEL_URL } = require("./config/env");

// Import the bot — this automatically starts login!
const { discordBotClient } = require("./discord/bot");
const userQueue = require("./utils/queue-worker");

// Global references
let stopMonitoring = null;
let browser = null;

async function startPermanentMonitoring() {
  try {
    log("Launching browser for permanent monitoring...");
    // Correct: Use the page returned by launchBrowser
    ({ browser, page } = await launchBrowser({
      headful: false,
      usePersistentSession: true,
    }));

    // const page = await browser.newPage();

    await ensureAuthenticated(page);

    await navigateToChannel(page, CHANNEL_URL);

    log("Starting advanced monitoring (will run forever)...");
    const { stop } = await startAdvancedMonitoring(page);

    // Save the stop function for graceful shutdown
    stopMonitoring = stop;

    log("Monitoring is now ACTIVE and watching the channel 24/7!");

    userQueue.start(); // ← Starts processing the queue continuously

    log("Press Ctrl+C to stop safely.");

    // Optional: You can still extract users once at start if needed
    // const { extractDetailedUsers } = require("./puppeteer/extractUsers");
    // const users = await extractDetailedUsers(page);
    // log(`Initial user count: ${users.length}`);
  } catch (error) {
    log(`Fatal error during startup: ${error.message}`);
    log(`Stack: ${error.stack}`);
    if (browser) await closeBrowser(browser);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  log("\nReceived shutdown signal (Ctrl+C)");
  log("Stopping monitoring and closing browser...");

  if (stopMonitoring) await stopMonitoring();
  if (browser) await closeBrowser(browser);

  // Optional: destroy bot client
  if (discordBotClient?.isReady()) {
    await discordBotClient.destroy();
    log("Discord bot logged out");
  }

  log("Shutdown complete. Goodbye!");
  process.exit(0);
});

// Start everything
log("Discord Channel Monitor started! (Permanent live monitoring mode)");
startPermanentMonitoring();

// Keep the process alive forever (backup in case something goes wrong)
setInterval(() => {}, 1 << 30);
