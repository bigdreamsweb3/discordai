// app.js
const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron");
const path = require("path");
require("dotenv").config();

const { CHANNEL_URLS } = require("./config/env"); // Must be an array!

// Import the bot — this automatically starts login!
const { discordBotClient } = require("./discord/bot");

let mainWindow;
let tray = null;
let stopFunctions = []; // Array to hold { stop, channelUrl }
let browser = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, "assets/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "renderer/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile("renderer/index.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.setMenuBarVisibility(false);
}

function createTray() {
  tray = new Tray(path.join(__dirname, "assets/icon.ico"));
  tray.setToolTip("Discord Channel Monitor");
  tray.on("click", () => {
    mainWindow?.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show App", click: () => mainWindow?.show() },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

// Send logs to renderer process
function sendLog(message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("log-update", {
      timestamp: new Date().toISOString(),
      message,
    });
  }
}

// Override console.log to also send to UI
const originalLog = console.log;
console.log = (...args) => {
  originalLog(...args);
  sendLog(args.join(" "));
};

async function startMonitoring() {
  try {
    const { log } = require("./utils/logger");
    const { launchBrowser, closeBrowser } = require("./puppeteer/browser");
    const { ensureAuthenticated } = require("./puppeteer/discordAuth");
    const { navigateToChannel } = require("./puppeteer/navigate");
    const { startAdvancedMonitoring } = require("./monitor");

    // Singleton queue worker
    const userQueue = require("./utils/queue-worker");

    log("Launching browser...");
    sendLog("Launching browser...");

    // Launch single browser with persistent session
    ({ browser } = await launchBrowser({
      headful: false,
      usePersistentSession: true,
    }));

    // Authenticate once using the initial page
    const authPage = await browser.newPage();
    await ensureAuthenticated(authPage);
    await authPage.close();
    log("Authentication completed (shared session for all channels)");
    sendLog("Authentication completed — monitoring multiple channels");

    // Reset stop functions
    stopFunctions = [];

    // Monitor each channel in its own tab
    for (const channelUrl of CHANNEL_URLS) {
      log(`Setting up monitoring for channel: ${channelUrl}`);
      sendLog(`Setting up: ${channelUrl}`);

      const page = await browser.newPage();

      try {
        await navigateToChannel(page, channelUrl);
        log(`Navigated to channel: ${channelUrl}`);

        const { stop } = await startAdvancedMonitoring(page);

        stopFunctions.push({
          stop,
          channelUrl,
          page,
        });

        log(`Monitoring STARTED for ${channelUrl}`);
        sendLog(`Monitoring ACTIVE: ${channelUrl}`);
      } catch (err) {
        log(`Failed to start monitoring for ${channelUrl}: ${err.message}`);
        sendLog(`Failed: ${channelUrl} — ${err.message}`);
        await page.close();
      }
    }

    if (stopFunctions.length === 0) {
      sendLog("ERROR: No channels were successfully monitored!");
      return;
    }

    sendLog(`Monitoring ACTIVE for ${stopFunctions.length} channel(s) 24/7!`);
    log(`Monitoring ${stopFunctions.length} channels successfully`);

    // Start queue processing (only if you want it to begin now)
    userQueue.start();
    sendLog("Queue worker STARTED — processing users");
  } catch (err) {
    console.error("Fatal error in monitoring:", err);
    sendLog(`FATAL ERROR: ${err.message}`);
  }
}

// IPC: Allow renderer to trigger queue start/stop or add channels later
ipcMain.on("start-queue", () => {
  const userQueue = require("./utils/queue-worker");
  userQueue.start();
  sendLog("Queue processing started manually");
});

ipcMain.on("stop-queue", () => {
  const userQueue = require("./utils/queue-worker");
  userQueue.stop?.();
  sendLog("Queue processing stopped");
});

// App ready
app.whenReady().then(() => {
  createWindow();
  createTray();
  startMonitoring();
});

app.on("window-all-closed", () => {
  // Keep running in tray on Windows/Linux
  if (process.platform !== "darwin") {
    // Don't quit
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Graceful shutdown
app.on("before-quit", async (event) => {
  if (browser || stopFunctions.length > 0) {
    event.preventDefault(); // Prevent immediate quit
    sendLog("Shutting down gracefully...");

    // Stop all channel monitoring
    for (const { stop, channelUrl } of stopFunctions) {
      try {
        if (stop) await stop();
        sendLog(`Stopped monitoring: ${channelUrl}`);
      } catch (e) {
        console.error(`Error stopping ${channelUrl}:`, e);
      }
    }

    // Close browser
    if (browser) {
      await browser.close();
      sendLog("Browser closed");
    }

    // Logout bot
    if (discordBotClient?.isReady()) {
      await discordBotClient.destroy();
      sendLog("Discord bot logged out");
    }

    // Now quit
    app.quit();
  }
});
