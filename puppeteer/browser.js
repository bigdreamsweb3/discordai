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
      "--start-maximized", // Maximizes the window (works in both headless & headful)
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-web-security",
      "--allow-running-insecure-content",
      // Optional: better for Discord
      "--window-position=0,0",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  };

  if (usePersistentSession) {
    // launchOptions.userDataDir = path.resolve(__dirname, "../discord-session");
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
