// index.js
const { log } = require("./utils/logger");
const { launchBrowser, closeBrowser } = require("./puppeteer/browser"); // Removed getPersistentBrowser if not properly implemented
const { ensureAuthenticated } = require("./puppeteer/discordAuth");
const { navigateToChannel } = require("./puppeteer/navigate");
const { startAdvancedMonitoring } = require("./monitor");

const { CHANNEL_URLS } = require("./config/env"); // Must be an array!

const { discordBotClient } = require("./discord/bot");
const userQueue = require("./utils/queue-worker");

// Global references
let stopFunctions = []; // Array of { stop, channelUrl, page }
let browser = null;

async function startPermanentMonitoring() {
  try {
    log("Launching browser for multi-channel permanent monitoring...");

    // Launch ONE browser instance (shared session)
    ({ browser } = await launchBrowser({
      headful: false,
      usePersistentSession: true,
    }));

    // Use the initial page just for authentication
    const authPage = await browser.newPage();
    await ensureAuthenticated(authPage);
    await authPage.close();
    log("Authentication completed (shared session for all channels)");

    // Array to collect stop functions
    stopFunctions = [];

    for (const channelUrl of CHANNEL_URLS) {
      log(`Setting up monitoring for channel: ${channelUrl}`);

      const page = await browser.newPage();

      try {
        await navigateToChannel(page, channelUrl);
        log(`Navigated to channel: ${channelUrl}`);

        const { stop } = await startAdvancedMonitoring(page);

        // Save stop function + metadata for graceful shutdown
        stopFunctions.push({
          stop,
          channelUrl,
          page, // optional: keep reference if needed later
        });

        log(`Monitoring STARTED for ${channelUrl}`);
      } catch (err) {
        log(`Failed to start monitoring for ${channelUrl}: ${err.message}`);
        log(`Stack: ${err.stack}`);
        await page.close(); // Clean up failed page
      }
    }

    if (stopFunctions.length === 0) {
      throw new Error("No channels were successfully monitored!");
    }

    log(
      `Monitoring is now ACTIVE for ${stopFunctions.length} channel(s) 24/7!`
    );

    userQueue.start(); // ← Starts processing the queue continuously

    log("Press Ctrl+C to stop safely.");
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
  log("Stopping all monitoring and closing browser...");

  // Properly stop all monitoring instances
  for (const { stop, channelUrl } of stopFunctions) {
    try {
      if (stop) {
        await stop();
        log(`Stopped monitoring for ${channelUrl}`);
      }
    } catch (e) {
      log(`Error stopping ${channelUrl}: ${e.message}`);
    }
  }

  // Close browser once
  if (browser) {
    await closeBrowser(browser);
    log("Browser closed.");
  }

  // Logout Discord bot if running
  if (discordBotClient?.isReady()) {
    await discordBotClient.destroy();
    log("Discord bot logged out");
  }

  log("Shutdown complete. Goodbye!");
  process.exit(0);
});

// Start everything
log("Discord Multi-Channel Monitor started!");
startPermanentMonitoring();

// Set up a keep-alive ping to prevent Render from shutting down the service
let keepAliveInterval;
function setupKeepAlive() {
  // Clear any existing interval
  if (keepAliveInterval) clearInterval(keepAliveInterval);

  // Get server URL from environment or build it
  const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const fullServerUrl = serverUrl.includes("://")
    ? serverUrl
    : `https://${serverUrl}`;

  log(`Setting up keep-alive ping to ${fullServerUrl}`);

  // Set up a new interval to ping the server more frequently (every 5 minutes)
  // Render's free tier spins down after 15 minutes of inactivity
  keepAliveInterval = setInterval(() => {
    // Log less frequently to avoid filling logs
    const shouldLog = Math.random() < 0.1; // Only log ~10% of pings

    // Make an HTTP request to our own service
    const pingUrl = `${fullServerUrl}/ping`;
    const options = {
      method: "GET",
      timeout: 10000, // 10-second timeout
    };

    // Use native http or https based on URL
    const httpClient = pingUrl.startsWith("https") ? require("https") : http;

    if (shouldLog) {
      log(`Sending keep-alive ping to ${pingUrl}`);
    }

    const req = httpClient.request(pingUrl, options, (res) => {
      if (shouldLog) {
        log(`Keep-alive ping response: ${res.statusCode}`);
      }

      // Read the response data to properly close the connection
      let rawData = "";
      res.on("data", (chunk) => {
        rawData += chunk;
      });
    });

    req.on("error", (error) => {
      log(`Keep-alive ping failed: ${error.message}`);

      // If our standard ping fails, try an alternative approach
      try {
        // Try to make a request directly to Render's app URL if we have the app name
        const renderApp = process.env.RENDER_APP_NAME || "dcai";
        const renderUrl = `https://${renderApp}.onrender.com/ping`;

        log(`Attempting alternative ping to ${renderUrl}`);

        const altReq = https.request(
          renderUrl,
          { method: "GET", timeout: 10000 },
          (altRes) => {
            log(`Alternative ping response: ${altRes.statusCode}`);

            // Read the response data
            let altData = "";
            altRes.on("data", (chunk) => {
              altData += chunk;
            });
          }
        );

        altReq.on("error", (altError) => {
          log(`Alternative ping also failed: ${altError.message}`);
        });

        altReq.end();
      } catch (backupError) {
        log(`Failed to perform backup ping: ${backupError.message}`);
      }
    });

    req.end();
  }, 5 * 60 * 1000); // Every 5 minutes instead of 14

  // Also set up an external ping service if configured
  // This is crucial for keeping the Render free tier from sleeping
  if (process.env.PING_URL) {
    const pingTargets = process.env.PING_URL.split(",").map((url) =>
      url.trim()
    );

    // Register our service with multiple ping services for redundancy
    pingTargets.forEach((target) => {
      const pingUrl = target.replace(
        "{url}",
        encodeURIComponent(fullServerUrl)
      );

      log(`Registering with external ping service: ${pingUrl}`);

      // Make a one-time request to register
      const httpClient = pingUrl.startsWith("https") ? require("https") : http;
      const req = httpClient.request(
        pingUrl,
        { method: "GET", timeout: 30000 },
        (res) => {
          log(`Ping service registration response: ${res.statusCode}`);

          // Read the response data
          let pingData = "";
          res.on("data", (chunk) => {
            pingData += chunk;
          });
          res.on("end", () => {
            if (pingData.length > 0) {
              log(
                `Ping service response: ${pingData.substring(0, 100)}`
              );
            }
          });
        }
      );

      req.on("error", (error) => {
        log(`Failed to register with ping service: ${error.message}`);
      });

      req.end();
    });
  } else {
    log(
      "No external ping service configured. Set PING_URL in env vars for better uptime."
    );
    log(
      "Example services: https://cron-job.org, https://uptimerobot.com, https://cronitor.io"
    );
  }

  log("Keep-alive ping mechanism initialized");
}

// Keep process alive
setInterval(() => {}, 1 << 30);
setupKeepAlive();
