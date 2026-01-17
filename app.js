// app.js

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// ====================
// Global State
// ====================
let mainWindow = null;
let tray = null;
let stopFunctions = []; // { stop, channelUrl, page }
let browser = null;
let discordBotClient = null;
let CHANNEL_URLS = []; // Loaded from config
let saveChannels = () => console.warn("saveChannels not available yet");
let isMonitoringActive = false; // Tracks monitoring state

// ====================
// Safe Logging System
// ====================
const originalConsoleLog = console.log;

function sendLog(message) {
  originalConsoleLog(message); // Always log to terminal

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("log-update", {
      timestamp: new Date().toISOString(),
      message,
    });
  }
}

// Override console.log globally for safety
console.log = (...args) => sendLog(args.join(" "));

// ====================
// Window & Tray
// ====================
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
  const iconPath = path.join(__dirname, "assets/icon.ico");
  if (!fs.existsSync(iconPath)) {
    sendLog("Tray icon not found: " + iconPath);
    return;
  }

  tray = new Tray(iconPath);
  tray.setToolTip("DCAI");

  tray.on("click", () => {
    mainWindow?.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show App", click: () => mainWindow?.show() },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

// ====================
// Initial State Sync
// ====================
function sendInitialState() {
  if (!mainWindow?.webContents) return;

  // Send channels list
  mainWindow.webContents.send("channels-update", CHANNEL_URLS);

  // Send current target display text
  const targetText =
    CHANNEL_URLS.length === 1
      ? CHANNEL_URLS[0]
      : CHANNEL_URLS.length > 0
      ? `${CHANNEL_URLS.length} channels active`
      : "No channels active";

  mainWindow.webContents.send("current-target-update", targetText);

  // Send monitoring status
  mainWindow.webContents.send("monitoring-status", isMonitoringActive);

  sendLog("Initial app state sent to renderer");
}

// ====================
// Config Loading
// ====================
function loadConfig() {
  const dotenv = require("dotenv");
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, ".env");

  sendLog(`Loading config from: ${envPath}`);

  const result = dotenv.config({ path: envPath });

  if (result.error) {
    sendLog(`Could not load .env file: ${result.error.message}`);
    sendLog("Using default empty channel list.");
  } else {
    sendLog(".env loaded successfully");
  }

  try {
    const configModule = require("./config/env");
    CHANNEL_URLS = configModule.CHANNEL_URLS || [];
    saveChannels =
      configModule.saveChannels ||
      (() => sendLog("saveChannels not implemented"));

    sendLog(`Loaded ${CHANNEL_URLS.length} channel(s) from config`);
  } catch (err) {
    sendLog(`Error loading config/env.js: ${err.message}`);
    sendLog("Falling back to empty channel list");
    CHANNEL_URLS = [];
    saveChannels = () => sendLog("saveChannels unavailable");
  }
}

// ====================
// Discord Bot
// ====================
function startDiscordBot() {
  if (!discordBotClient) {
    try {
      ({ discordBotClient } = require("./discord/bot"));
    } catch (err) {
      sendLog(`Failed to start Discord bot: ${err.message}`);
    }
  }
}

// ====================
// Monitoring Logic
// ====================
// In app.js — replace the current authentication block in startMonitoring()

async function startMonitoring() {
  if (isMonitoringActive) {
    sendLog("Monitoring already active");
    return;
  }

  try {
    const { launchBrowser } = require("./puppeteer/browser");
    const { loginToDiscord } = require("./puppeteer/login"); // ← the same function as in index.js
    const { navigateToChannel } = require("./puppeteer/navigate");
    const { startAdvancedMonitoring } = require("./monitor");
    const userQueue = require("./utils/queue-worker");

    sendLog("Launching browser for authentication...");

    // Do this:
    const { DISCORD_EMAIL, DISCORD_PASSWORD } = require("./config/env");

    // Then use them normally:
    const authResult = await loginToDiscord(
      DISCORD_EMAIL,
      DISCORD_PASSWORD,
      null
    );

    if (!authResult.authenticated) {
      sendLog("❌ Authentication failed");
      return;
    }

    sendLog("✅ Discord authentication successful!");
    browser = authResult.browser;

    stopFunctions = [];

    sendLog("Starting monitoring for all channels...");

    for (const channelUrl of CHANNEL_URLS) {
      sendLog(`Setting up monitoring → ${channelUrl}`);

      const page = await browser.newPage();

      try {
        await navigateToChannel(page, channelUrl);
        const { stop } = await startAdvancedMonitoring(page);

        stopFunctions.push({ stop, channelUrl, page });

        sendLog(`Monitoring ACTIVE: ${channelUrl}`);
      } catch (err) {
        sendLog(`Failed to setup monitoring for ${channelUrl}: ${err.message}`);
        await page.close();
      }
    }

    if (stopFunctions.length === 0) {
      sendLog("ERROR: No channels were successfully started!");
      await browser.close();
      browser = null;
      return;
    }

    sendLog(`Monitoring ACTIVE for ${stopFunctions.length} channel(s)`);

    // UI updates
    mainWindow?.webContents.send("monitoring-status", true);
    mainWindow?.webContents.send("channels-update", CHANNEL_URLS);
    mainWindow?.webContents.send(
      "current-target-update",
      stopFunctions.length === 1
        ? stopFunctions[0].channelUrl
        : `${stopFunctions.length} channels active`
    );

    isMonitoringActive = true;
    userQueue.start();
    sendLog("Queue worker STARTED");
  } catch (err) {
    sendLog(`FATAL ERROR during monitoring startup: ${err.message}`);
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  }
}
// ====================
// IPC Handlers
// ====================
ipcMain.on("add-channel", (event, { serverId, channelId }) => {
  const newUrl = `https://discord.com/channels/${serverId}/${channelId}`;
  const updatedUrls = [...CHANNEL_URLS, newUrl];
  saveChannels(updatedUrls);
  CHANNEL_URLS = updatedUrls;

  sendLog(`Added channel: ${newUrl}`);
  mainWindow?.webContents.send("channels-update", updatedUrls);
  mainWindow?.webContents.send("current-target-update", newUrl);
});

ipcMain.on("remove-channel", (event, channelData) => {
  const { url } = channelData;
  const updatedUrls = CHANNEL_URLS.filter((u) => u !== url);
  saveChannels(updatedUrls);
  CHANNEL_URLS = updatedUrls;

  sendLog(`Remove requested: ${url}`);

  const index = stopFunctions.findIndex((item) => item.channelUrl === url);
  if (index !== -1) {
    const { stop, page } = stopFunctions[index];
    stop?.();
    page?.close();
    stopFunctions.splice(index, 1);
    sendLog(`Stopped monitoring: ${url}`);
  }

  const remainingUrls = stopFunctions.map((item) => item.channelUrl);
  mainWindow?.webContents.send("channels-update", remainingUrls);
  mainWindow?.webContents.send(
    "current-target-update",
    remainingUrls.length === 1
      ? remainingUrls[0]
      : remainingUrls.length > 0
      ? `${remainingUrls.length} channels active`
      : "No channels active"
  );
});

ipcMain.on("start-monitoring", async () => {
  if (isMonitoringActive) {
    sendLog("Monitoring already running");
    return;
  }

  await startMonitoring();

  startDiscordBot();
});

ipcMain.on("stop-monitoring", async () => {
  if (!isMonitoringActive) {
    sendLog("Monitoring not active");
    return;
  }

  sendLog("Stopping all monitoring...");

  for (const { stop, page, browser, channelUrl } of stopFunctions) {
    try {
      if (stop) await stop();
      if (page) await page.close();
      if (browser) await browser.close();
      sendLog(`Stopped: ${channelUrl}`);
    } catch (e) {
      console.error(e);
    }
  }

  stopFunctions = [];
  isMonitoringActive = false;

  mainWindow?.webContents.send("monitoring-status", false);
  mainWindow?.webContents.send("channels-update", []);
  mainWindow?.webContents.send("current-target-update", "Monitoring stopped");
});

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

// ====================
// App Lifecycle
// ====================
app.whenReady().then(async () => {
  sendLog("App starting...");

  loadConfig();

  sendLog("Creating window...");
  createWindow();

  sendLog("Creating system tray icon...");
  createTray();

  // Send initial state once renderer is loaded
  mainWindow.webContents.once("did-finish-load", () => {
    sendInitialState();
    sendLog("Renderer fully loaded — initial state synchronized");
  });

  sendLog("App ready. Waiting for user action.");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in background (tray)
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Graceful shutdown
app.on("before-quit", async (event) => {
  if (browser || stopFunctions.length > 0 || isMonitoringActive) {
    event.preventDefault();
    sendLog("Shutting down gracefully...");

    for (const { stop, page, channelUrl } of stopFunctions) {
      try {
        if (stop) await stop();
        if (page) await page.close();
        sendLog(`Cleaned up: ${channelUrl}`);
      } catch (e) {
        console.error(e);
      }
    }

    if (browser) {
      await browser.close();
      sendLog("Browser closed");
    }

    if (discordBotClient?.isReady()) {
      await discordBotClient.destroy();
      sendLog("Discord bot logged out");
    }

    app.quit();
  }
});
