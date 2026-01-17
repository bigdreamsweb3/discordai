const { log } = require("../utils/logger");
const DiscordPlugins = require("./discord_plugins");
const { launchBrowser } = require("./browser");

// Shared session folder so headful and headless share cookies/login state
const SESSION_NAME = "discord-session";

async function loginToDiscord(email, password, expressApp) {
  log("🔐 Starting Discord login flow...");

  // 1. Start with headless browser
  const { browser: headlessBrowser, page } = await launchBrowser({
    headful: false,
    usePersistentSession: true,
    userDataDirName: SESSION_NAME,
  });

  const plugins = new DiscordPlugins(page);

  try {
    log("Checking current authentication state...");
    await page.goto("https://discord.com/app", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await plugins.wait.forLoad({ timeout: 10000 });

    const pageState = await detectPageState(page);

    // SUCCESS: Already logged in
    if (pageState === "authenticated") {
      log("✅ Authenticated (Headless mode active)");
      return { authenticated: true, page, browser: headlessBrowser };
    }

    // 2. Navigate to login
    log("Navigating to login page...");
    await page.goto("https://discord.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await new Promise((r) => setTimeout(r, 2000));

    // Auto-attempt 1 (Headless)
    log("\n📋 Auto-Login Attempt #1 (Headless)");
    let loginResult = await attemptAutoLogin(page, email, password);

    if (loginResult.authenticated) {
      log("✅ Auto-login successful!");
      return { authenticated: true, page, browser: headlessBrowser };
    }

    // 3. CAPTCHA or Failure -> Switch to Headful but auto-fill there too
    if (loginResult.openHeadful || loginResult.authenticated === false) {
      log("⚠️  Manual intervention required — switching to headful browser...");

      // Close the current headless session to release folder locks
      await page.close().catch(() => {});
      await headlessBrowser.close().catch(() => {});

      // Open headful, fill credentials automatically, then let human solve CAPTCHA
      const humanSuccess = await handleHumanLogin(email, password, expressApp);

      if (humanSuccess) {
        log("🔄 Manual login finished. Restarting in Headless mode...");
        // Restart the whole flow — this time it will hit the "Already authenticated" block
        return await loginToDiscord(email, password, expressApp);
      }
    }

    throw new Error("Login failed to progress.");
  } catch (error) {
    log(`Error during login: ${error.message}`);
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (headlessBrowser) await headlessBrowser.close().catch(() => {});
    throw error;
  }
}

// Helper to fill credentials and click submit
async function attemptAutoLogin(page, email, password) {
  try {
    const isLoginPage = await page.evaluate(
      () => window.location.pathname === "/login"
    );
    if (!isLoginPage) {
      await page.goto("https://discord.com/login", {
        waitUntil: "domcontentloaded",
      });
      await new Promise((r) => setTimeout(r, 2000));
    }

    log("Filling credentials...");
    await page.waitForSelector('input[name="email"]', {
      timeout: 10000,
      visible: true,
    });
    await page.focus('input[name="email"]');
    // Clear field just in case
    await page.click('input[name="email"]', { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type('input[name="email"]', email, { delay: 30 });

    await page.waitForSelector('input[name="password"]', {
      timeout: 5000,
      visible: true,
    });
    await page.focus('input[name="password"]');
    await page.type('input[name="password"]', password, { delay: 30 });

    log("Submitting form...");
    await page.click('button[type="submit"]');

    await new Promise((r) => setTimeout(r, 4000));

    const hasCaptcha = await detectCaptchaModal(page);
    if (hasCaptcha) {
      log("🔴 CAPTCHA detected!");
      return { authenticated: false, openHeadful: true };
    }

    const currentUrl = await page.evaluate(() => window.location.pathname);
    if (currentUrl.includes("/app") || currentUrl.includes("/channels")) {
      const sidebarAppears = await waitForSidebar(page, 15000);
      if (sidebarAppears) return { authenticated: true, openHeadful: false };
    }

    return { authenticated: false, openHeadful: false };
  } catch (error) {
    log(`Auto-login error: ${error.message}`);
    return { authenticated: false, openHeadful: false };
  }
}

// Opens headful browser, fills credentials, waits for human to solve CAPTCHA
async function handleHumanLogin(email, password, expressApp) {
  log("👤 Opening headful browser...");

  const { browser: headfulBrowser, page: headfulPage } = await launchBrowser({
    headful: true,
    usePersistentSession: true,
    userDataDirName: SESSION_NAME,
  });

  try {
    await headfulPage.goto("https://discord.com/login", {
      waitUntil: "domcontentloaded",
    });

    // AUTO-FILL IN HEADFUL MODE
    log("🤖 Auto-filling credentials in headful window...");
    await attemptAutoLogin(headfulPage, email, password);

    log(
      "👉 Bot has filled credentials. PLEASE SOLVE CAPTCHA manually if it appears."
    );

    const maxWait = 900000; // 15 mins
    const start = Date.now();
    let manualConfirmed = false;

    // Handle manual confirmation button from your Web UI
    expressApp.get("/auth/manual-check", (req, res) => {
      manualConfirmed = true;
      res.send("Confirmed! Switching to headless...");
    });

    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          if (headfulPage.isClosed()) {
            clearInterval(checkInterval);
            resolve(false);
            return;
          }

          const state = await detectPageState(headfulPage);
          const elapsed = Math.round((Date.now() - start) / 1000);

          if (state === "authenticated" || manualConfirmed) {
            log("✅ Login success detected in headful window!");
            clearInterval(checkInterval);
            await headfulPage.close().catch(() => {});
            await headfulBrowser.close().catch(() => {});
            resolve(true);
          } else if (Date.now() - start > maxWait) {
            log("❌ Manual login timeout.");
            clearInterval(checkInterval);
            await headfulBrowser.close().catch(() => {});
            resolve(false);
          } else if (elapsed % 15 === 0) {
            log(`⏳ Waiting for human to finish (${elapsed}s)...`);
          }
        } catch (e) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 3000);
    });
  } catch (err) {
    log(`Headful error: ${err.message}`);
    await headfulBrowser.close().catch(() => {});
    return false;
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

async function waitForSidebar(page, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await detectPageState(page);
    if (state === "authenticated") return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function detectCaptchaModal(page) {
  try {
    return await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const h1 = document.querySelector("h1");
      const hasText =
        bodyText.includes("Are you human") ||
        (h1 && h1.textContent.includes("human"));
      const hasIframe = !!document.querySelector('iframe[src*="hcaptcha.com"]');
      return hasText || hasIframe;
    });
  } catch (e) {
    return false;
  }
}

module.exports = { loginToDiscord };
