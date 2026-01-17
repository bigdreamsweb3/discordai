// puppeteer/browser.js
const puppeteer = require("puppeteer-core");
const path = require("path");
const { log } = require("../utils/logger");

// Stealth plugin setup
const stealth = require("puppeteer-extra-plugin-stealth");
const puppeteerExtra = require("puppeteer-extra");

const enabledEvasions = new Set(stealth.availableEvasions);
enabledEvasions.delete("sourceurl");
enabledEvasions.delete("chrome.runtime"); // Often triggers detection
enabledEvasions.delete("navigator.permissions");

puppeteerExtra.use(stealth({ enabledEvasions }));

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
    headless: headful ? false : "new",
    channel: "chrome",
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Memory optimization
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
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync", // Speed optimization
      "--disable-breakpad", // Crash reporter
      "--metrics-recording-only",
      // Better user agent
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  };

  if (usePersistentSession) {
    launchOptions.userDataDir = path.resolve(__dirname, "../discord-session");
  }

  if (process.platform === "win32") {
    launchOptions.args.push("--disable-features=WinDelayAsh");
    launchOptions.args.push("--force-color-profile=srgb");
  } else if (process.platform === "linux") {
    launchOptions.args.push("--disable-features=TranslateUI");
  }

  const browser = await puppeteerExtra.launch(launchOptions);

  if (usePersistentSession) {
    persistentBrowser = browser;
    log("✅ Persistent browser saved for reuse");
  }

  const page = await browser.newPage();

  // Ultra stealth + CAPTCHA avoidance
  await page.evaluateOnNewDocument(() => {
    // Remove webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    delete navigator.__proto__.webdriver;

    // Add chrome object
    window.chrome = { runtime: {} };

    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);

    // Fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // Fake languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Realistic vendor
    Object.defineProperty(navigator, "vendor", {
      get: () => "Google Inc.",
    });

    // Canvas fingerprint spoofing (tricks CAPTCHA)
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () {
      if (this.width === 280 && this.height === 60) {
        return (
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAA8CAYAAABv" +
          "2cqaAAAA+klEQVR4nO3XMQrCQBCG4Q=="
        );
      }
      return originalToDataURL.call(this);
    };
  });

  if (headful) {
    try {
      const session = await page.target().createCDPSession();
      const { windowId } = await session.send("Browser.getWindowForTarget");
      await session.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "maximized" },
      });
    } catch (e) {
      log("Could not maximize window:", e.message);
    }
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
    if (browser === persistentBrowser) persistentBrowser = null;
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
