const { log } = require("../utils/logger");
const DiscordPlugins = require("./discord_plugins");
const { launchBrowser } = require("./browser");

// Shared session folder so headful and headless share cookies/login state
const SESSION_NAME = "discord-session";

async function loginToDiscord(email, password, expressApp) {
  log("🔐 Starting Discord login flow...");

  // Start with headful browser for manual login
  log("👤 Opening browser for manual login...");

  const { browser: headfulBrowser, page: headfulPage } = await launchBrowser({
    headful: true,
    usePersistentSession: true,
    userDataDirName: SESSION_NAME,
  });

  try {
    await headfulPage.goto("https://discord.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Optional: Auto-fill credentials (but don't auto-submit)
    if (email && password) {
      log("🤖 Auto-filling credentials for convenience...");
      await headfulPage
        .waitForSelector('input[name="email"]', {
          timeout: 10000,
          visible: true,
        })
        .catch(() => {});

      // Fill email if field exists
      await headfulPage.evaluate((email) => {
        const emailInput = document.querySelector('input[name="email"]');
        if (emailInput) {
          emailInput.value = email;
        }
      }, email);

      // Fill password if field exists
      await headfulPage.evaluate((password) => {
        const passwordInput = document.querySelector('input[name="password"]');
        if (passwordInput) {
          passwordInput.value = password;
        }
      }, password);
    }

    log("\n==========================================");
    log("👤 MANUAL LOGIN REQUIRED");
    log("==========================================");
    log("Please complete the login manually in the browser window.");
    log("This includes solving CAPTCHA if required.");
    log("The system will wait until you're logged in.");
    log("==========================================");

    const maxWait = 900000; // 15 mins
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          if (headfulPage.isClosed()) {
            clearInterval(checkInterval);
            reject(new Error("Browser window was closed"));
            return;
          }

          // Check if we're authenticated
          const currentUrl = await headfulPage.evaluate(
            () => window.location.href
          );
          const isAuthenticated =
            currentUrl.includes("/app") || currentUrl.includes("/channels");

          const hasSidebar = await detectPageState(headfulPage);
          const elapsed = Math.round((Date.now() - start) / 1000);

          if (isAuthenticated || hasSidebar === "authenticated") {
            log("✅ Login successful detected!");
            clearInterval(checkInterval);

            // Close headful browser
            await headfulPage.close().catch(() => {});
            await headfulBrowser.close().catch(() => {});

            // Restart in headless mode with saved session
            log("🔄 Switching to headless mode...");
            const { browser: headlessBrowser, page } = await launchBrowser({
              headful: false,
              usePersistentSession: true,
              userDataDirName: SESSION_NAME,
            });

            await page.goto("https://discord.com/app", {
              waitUntil: "domcontentloaded",
              timeout: 60000,
            });

            resolve({ authenticated: true, page, browser: headlessBrowser });
          } else if (Date.now() - start > maxWait) {
            log("❌ Manual login timeout.");
            clearInterval(checkInterval);
            await headfulBrowser.close().catch(() => {});
            reject(new Error("Manual login timeout"));
          } else if (elapsed % 30 === 0) {
            log(
              `⏳ Waiting for manual login to complete (${elapsed}s elapsed)...`
            );
          }
        } catch (e) {
          clearInterval(checkInterval);
          reject(e);
        }
      }, 3000);
    });
  } catch (error) {
    log(`Error during login: ${error.message}`);
    if (headfulPage && !headfulPage.isClosed())
      await headfulPage.close().catch(() => {});
    if (headfulBrowser) await headfulBrowser.close().catch(() => {});
    throw error;
  }
}

// --- Helpers ---

async function detectPageState(page) {
  try {
    return await page.evaluate(() => {
      const sidebar = document.querySelector(
        'nav[aria-label="Servers sidebar"]'
      );
      if (sidebar && sidebar.offsetHeight > 0) return "authenticated";
      return "unknown";
    });
  } catch (e) {
    return "unknown";
  }
}

module.exports = { loginToDiscord };
