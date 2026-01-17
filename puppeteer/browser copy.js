// puppeteer/browser.js

const puppeteer = require("puppeteer-extra");
const path = require("path");
const { log } = require("../utils/logger");

// Stealth plugin setup
const stealth = require("puppeteer-extra-plugin-stealth");
const enabledEvasions = new Set(stealth.availableEvasions);
enabledEvasions.delete("sourceurl"); // Optional: avoids known issues

puppeteer.use(stealth({ enabledEvasions }));

let persistentBrowser = null;

async function launchBrowser({
  headful = false,
  usePersistentSession = true,
} = {}) {
  log(
    `Launching browser (${
      headful ? "headful" : "headless"
    }) with persistent session...`
  );

  const launchOptions = {
    headless: headful ? false : "new", // "new" for modern headless, false for visible
    defaultViewport: null, // THIS IS KEY: Let the browser use full window size
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--start-maximized",
      "--window-position=0,0",
      "--disable-extensions",
      "--disable-plugins",
      "--disable-default-apps",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
      "--no-first-run",
      "--no-default-browser-check",
      // Critical fixes for Windows + packaged apps
      "--disable-gpu", // Often helps with spawn issues
      "--disable-software-rasterizer",
      "--disable-background-networking",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--disk-cache-dir=nul",
    ],
    ignoreDefaultArgs: [
      "--enable-automation",
      "--enable-blink-features=AutomationControlled",
    ],
  };

  if (usePersistentSession) {
    launchOptions.userDataDir = path.resolve(__dirname, "../discord-session");
  }

  // Help Windows spawn Chrome properly in packaged apps
  if (process.platform === "win32") {
    launchOptions.args.push("--disable-features=WinDelayAsh");
    launchOptions.args.push("--force-color-profile=srgb");
  }

  const browser = await puppeteer.launch(launchOptions);

  if (usePersistentSession) {
    persistentBrowser = browser;
    log("Persistent browser saved for reuse (new tabs can be opened)");
  }

  const page = await browser.newPage();

  // Manual stealth tweaks
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });
    delete navigator.__proto__.webdriver;

    // Optional: hide puppeteer traces
    window.chrome = { runtime: {} };
    window.puppeteer = undefined;
  });

  // REMOVED THIS LINE COMPLETELY:
  // await page.setViewport({ width: 1920, height: 1080 });

  // Optional: For extra realism in headful mode, maximize the first window
  if (headful) {
    const session = await page.target().createCDPSession();
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
  }

  return { browser, page };
}

function getPersistentBrowser() {
  if (!persistentBrowser || persistentBrowser.isConnected?.() === false) {
    throw new Error("Persistent browser not launched or was closed");
  }
  return persistentBrowser;
}

async function closeBrowser(browser) {
  if (browser && browser.isConnected?.()) {
    await browser.close();
    log("Browser closed.");

    if (browser === persistentBrowser) {
      persistentBrowser = null;
    }
  }
}

async function closePersistentBrowser() {
  if (persistentBrowser) {
    await closeBrowser(persistentBrowser);
    persistentBrowser = null;
  }
}

module.exports = {
  launchBrowser,
  getPersistentBrowser,
  closeBrowser,
  closePersistentBrowser,
};
