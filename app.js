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

// Global variables
let mainWindow = null;
let tray = null;
let stopFunctions = []; // { stop, channelUrl, page }
let browser = null;
let discordBotClient = null;
let CHANNEL_URLS = []; // Default fallback
let saveChannels = () => console.warn("saveChannels not available yet");
let isMonitoringActive = false;

// === SAFE LOGGING SYSTEM ===
// We keep original console.log for terminal output
const originalConsoleLog = console.log;

// Our central logging function — used everywhere
function sendLog(message) {
  // 1. Always print to terminal (critical for debugging packaged app via cmd)
  originalConsoleLog(message);

  // 2. Send to renderer UI if window is ready
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("log-update", {
      timestamp: new Date().toISOString(),
      message,
    });
  }
}

// Override console.log so any accidental console.log() still goes through sendLog
console.log = (...args) => {
  sendLog(args.join(" "));
};

// Now use sendLog() everywhere instead of console.log()

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

function startDiscordBot() {
  if (!discordBotClient) {
    try {
      ({ discordBotClient } = require("./discord/bot"));
    } catch (err) {
      sendLog(`Failed to start Discord bot: ${err.message}`);
    }
  }
}

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
    saveChannels = configModule.saveChannels || (() => sendLog("saveChannels not implemented"));

    sendLog(`Loaded ${CHANNEL_URLS.length} channel(s) from config`);
  } catch (err) {
    sendLog(`Error loading config/env.js: ${err.message}`);
    sendLog("Falling back to empty channel list");
    CHANNEL_URLS = [];
    saveChannels = () => sendLog("saveChannels unavailable");
  }
}

async function startMonitoring() {
  try {
    const { log } = require("./utils/logger");
    const { launchBrowser } = require("./puppeteer/browser");
    const { ensureAuthenticated } = require("./puppeteer/discordAuth");
    const { navigateToChannel } = require("./puppeteer/navigate");
    const { startAdvancedMonitoring } = require("./monitor");
    const userQueue = require("./utils/queue-worker");

    log("Launching browser...");
    sendLog("Launching browser...");

    ({ browser } = await launchBrowser({
      headful: false,
      usePersistentSession: true,
    }));

    const authPage = await browser.newPage();
    await ensureAuthenticated(authPage);
    await authPage.close();
    sendLog("Authentication completed — monitoring multiple channels");

    stopFunctions = [];

    for (const channelUrl of CHANNEL_URLS) {
      sendLog(`Setting up: ${channelUrl}`);
      const page = await browser.newPage();

      try {
        await navigateToChannel(page, channelUrl);
        const { stop } = await startAdvancedMonitoring(page);
        stopFunctions.push({ stop, channelUrl, page });
        sendLog(`Monitoring ACTIVE: ${channelUrl}`);
      } catch (err) {
        sendLog(`Failed: ${channelUrl} — ${err.message}`);
        await page.close();
      }
    }

    if (stopFunctions.length === 0) {
      sendLog("ERROR: No channels were successfully monitored!");
      return;
    }

    sendLog(`Monitoring ACTIVE for ${stopFunctions.length} channel(s) 24/7!`);

    if (mainWindow?.webContents) {
      mainWindow.webContents.send("channels-update", CHANNEL_URLS);
      const targetText =
        CHANNEL_URLS.length === 1
          ? CHANNEL_URLS[0]
          : `${CHANNEL_URLS.length} channels active`;
      mainWindow.webContents.send("current-target-update", targetText);
    }

    isMonitoringActive = true;
    mainWindow?.webContents.send("monitoring-status", true);

    userQueue.start();
    sendLog("Queue worker STARTED — processing users");
  } catch (err) {
    console.error("Fatal error in monitoring:", err);
    sendLog(`FATAL ERROR: ${err.message}`);
  }
}

// IPC Handlers
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

ipcMain.on("add-channel", (event, { serverId, channelId }) => {
  const newUrl = `https://discord.com/channels/${serverId}/${channelId}`;
  const updatedUrls = [...CHANNEL_URLS, newUrl];
  saveChannels(updatedUrls);
  CHANNEL_URLS = updatedUrls;

  sendLog(`Added and saved channel: ${newUrl}`);
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
    sendLog(`Stopped and removed: ${url}`);
  }

  const remainingUrls = stopFunctions.map((item) => item.channelUrl);
  mainWindow?.webContents.send("channels-update", remainingUrls);
  const targetText =
    remainingUrls.length === 1
      ? remainingUrls[0]
      : remainingUrls.length > 0
      ? `${remainingUrls.length} channels active`
      : "No channels active";
  mainWindow?.webContents.send("current-target-update", targetText);
});

ipcMain.on("start-monitoring", async () => {
  if (isMonitoringActive) {
    sendLog("Monitoring already running");
    return;
  }
  try {
    startDiscordBot();
    await startMonitoring();
    isMonitoringActive = true;
    mainWindow?.webContents.send("monitoring-status", true);
  } catch (err) {
    sendLog(`Failed to start monitoring: ${err.message}`);
  }
});

ipcMain.on("stop-monitoring", async () => {
  if (!isMonitoringActive) {
    sendLog("Monitoring not running");
    return;
  }

  sendLog("Stopping all monitoring from UI request...");

  for (const { stop, page, channelUrl } of stopFunctions) {
    try {
      if (stop) await stop();
      if (page) await page.close();
      sendLog(`Stopped monitoring: ${channelUrl}`);
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

// App Ready
app.whenReady().then(async () => {
  sendLog("App starting...");

  loadConfig();

  sendLog("Creating window...");
  createWindow();

  sendLog("Window created and UI loading...");

  sendLog("Creating system tray icon...");
  createTray();

  sendLog("App ready. Waiting for user action.");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in tray
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Graceful shutdown
app.on("before-quit", async (event) => {
  if (browser || stopFunctions.length > 0) {
    event.preventDefault();
    sendLog("Shutting down gracefully...");

    for (const { stop, page, channelUrl } of stopFunctions) {
      try {
        if (stop) await stop();
        if (page) await page.close();
        sendLog(`Stopped monitoring: ${channelUrl}`);
      } catch (e) {
        console.error(`Error stopping ${channelUrl}:`, e);
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