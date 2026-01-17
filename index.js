// index.js
const { log } = require("./utils/logger");
const { closeBrowser } = require("./puppeteer/browser");
const { loginToDiscord } = require("./puppeteer/login");
const { navigateToChannel } = require("./puppeteer/navigate");
const { startAdvancedMonitoring } = require("./monitor");
const { CHANNEL_URLS } = require("./config/env");
const { discordBotClient } = require("./discord/bot");
const userQueue = require("./utils/queue-worker");
const express = require("express");

// Get credentials from env
const DISCORD_EMAIL = process.env.DISCORD_EMAIL;
const DISCORD_PASSWORD = process.env.DISCORD_PASSWORD;

if (!DISCORD_EMAIL || !DISCORD_PASSWORD) {
  log("❌ Error: DISCORD_EMAIL and DISCORD_PASSWORD must be set in .env");
  process.exit(1);
}

// Global references
let stopFunctions = [];
let browser = null;

// Express app setup
const app = express();

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

app.get("/", (req, res) => {
  res.status(200).send("Monitor running");
});

// Route for manual login confirmation
app.get("/auth/manual-check", (req, res) => {
  log("✅ MANUAL LOGIN CONFIRMATION RECEIVED ON PORT 3000");
  res.status(200).json({ status: "login_confirmed" });
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  log(`🌐 Server listening on port ${port}`);
});

async function startPermanentMonitoring() {
  try {
    log("🚀 Starting Discord bot monitoring...");

    log("📝 Attempting Discord authentication...");

    let authResult;
    try {
      // Login handles ALL browser launching (headless, headful, etc.)
      authResult = await loginToDiscord(DISCORD_EMAIL, DISCORD_PASSWORD, app);

      if (!authResult.authenticated) {
        throw new Error("Authentication failed - not authenticated");
      }

      log("✅ Authentication successful!");
      browser = authResult.browser;
    } catch (authError) {
      log(`❌ Authentication failed: ${authError.message}`);
      throw authError;
    }

    // Array to collect stop functions
    stopFunctions = [];

    // Monitor each channel
    for (const channelUrl of CHANNEL_URLS) {
      log(`\n📌 Setting up monitoring for: ${channelUrl}`);

      try {
        const page = await browser.newPage();

        // Navigate to channel
        await navigateToChannel(page, channelUrl);
        log(`✅ Navigated to channel`);

        // Start monitoring
        const { stop } = await startAdvancedMonitoring(page);

        // Store stop function for graceful shutdown
        stopFunctions.push({
          stop,
          channelUrl,
          page,
        });

        log(`🔴 Monitoring ACTIVE for ${channelUrl}`);
      } catch (err) {
        log(`❌ Failed to start monitoring for ${channelUrl}: ${err.message}`);
        // Continue to next channel instead of crashing
      }
    }

    if (stopFunctions.length === 0) {
      throw new Error("❌ No channels were successfully monitored!");
    }

    log(
      `\n✅ MONITORING ACTIVE for ${stopFunctions.length}/${CHANNEL_URLS.length} channel(s)`
    );

    // Start queue worker
    userQueue.start();
    log("🎯 Queue worker started");

    log("\n⏸️  Press Ctrl+C to stop safely.\n");
  } catch (error) {
    log(`\n❌ FATAL ERROR during startup:\n${error.message}\n`);
    log(`Stack: ${error.stack}`);

    // Cleanup on error
    if (browser) {
      try {
        await closeBrowser(browser);
      } catch (closeError) {
        log(`Error closing browser: ${closeError.message}`);
      }
    }

    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  log("\n\n⏹️  Received shutdown signal (Ctrl+C)");
  log("Stopping all monitoring...\n");

  // Stop all monitoring
  for (const { stop, channelUrl } of stopFunctions) {
    try {
      if (stop) {
        await stop();
        log(`✅ Stopped monitoring for ${channelUrl}`);
      }
    } catch (e) {
      log(`⚠️  Error stopping ${channelUrl}: ${e.message}`);
    }
  }

  // Close browser
  if (browser) {
    try {
      await closeBrowser(browser);
      log("✅ Browser closed");
    } catch (closeError) {
      log(`⚠️  Error closing browser: ${closeError.message}`);
    }
  }

  // Logout Discord bot
  if (discordBotClient?.isReady?.()) {
    try {
      await discordBotClient.destroy();
      log("✅ Discord bot logged out");
    } catch (botError) {
      log(`⚠️  Error logging out bot: ${botError.message}`);
    }
  }

  log("\n✅ Shutdown complete. Goodbye!\n");
  process.exit(0);
});

// Start everything
log("\n╔════════════════════════════════════════╗");
log("║  Discord Multi-Channel Bot Monitor    ║");
log("╚════════════════════════════════════════╝\n");

startPermanentMonitoring();

// Keep process alive
setInterval(() => {}, 1 << 30);
