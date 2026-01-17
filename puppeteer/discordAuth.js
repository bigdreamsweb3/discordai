// puppeteer/discordAuth.js (Handles frame detach & stale sessions)
const { log } = require("../utils/logger");
const { launchBrowser, getPersistentBrowser } = require("./browser");
const { loginToDiscord } = require("./login");

async function ensureAuthenticated(email, password, maxRetries = 3) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      retries++;
      log(`Authentication attempt #${retries}/${maxRetries}...`);

      let browser, page;

      try {
        // Try to reuse persistent browser
        browser = getPersistentBrowser();
        page = await browser.newPage();
        log("✅ Reusing persistent browser");
      } catch (error) {
        // Persistent browser dead or not initialized
        log(
          `⚠️  Persistent browser unavailable (${error.message}) — launching new one`
        );
        const result = await launchBrowser({
          headful: false,
          usePersistentSession: true,
        });
        browser = result.browser;
        page = result.page;
      }

      // Validate page is usable BEFORE navigation
      if (!page || page.isClosed?.()) {
        log("❌ Page is closed — creating new page");
        page = await browser.newPage();
      }

      // Add frame detach protection
      let frameDetached = false;
      const detachHandler = () => {
        frameDetached = true;
        log("⚠️  Frame detached detected");
      };

      page.once("framedetached", detachHandler);

      try {
        // Try to navigate with protection
        await navigateWithRetry(page, "https://discord.com/app", 3);

        if (frameDetached) {
          log("⚠️  Frame detached during navigation — retrying");
          page.off("framedetached", detachHandler);
          await page.close().catch(() => {});
          continue;
        }

        // Attempt login
        await loginToDiscord(page, email, password);
        log("✅ Authentication successful!");
        page.off("framedetached", detachHandler);
        return true;
      } catch (error) {
        page.off("framedetached", detachHandler);

        if (error.message.includes("frame was detached")) {
          log("❌ Frame detached during auth — session invalid");
          await page.close().catch(() => {});
          continue;
        }

        if (error.message.includes("Target closed")) {
          log("❌ Browser target closed — session lost");
          await page.close().catch(() => {});
          continue;
        }

        throw error;
      }
    } catch (error) {
      log(`❌ Authentication attempt #${retries} failed: ${error.message}`);

      if (retries < maxRetries) {
        const backoffDelay = 5000 * retries; // 5s, 10s, 15s
        log(`⏳ Backing off ${backoffDelay / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, backoffDelay));
      }
    }
  }

  throw new Error(
    `Failed to authenticate after ${maxRetries} attempts — session may be permanently invalid`
  );
}

// Navigate with automatic retry on frame detach
async function navigateWithRetry(page, url, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log(`Navigating to ${url} (attempt ${attempt}/${maxAttempts})...`);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      return; // Success
    } catch (error) {
      if (error.message.includes("frame was detached")) {
        log(`⚠️  Frame detached on attempt ${attempt}`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000)); // Wait before retry
          continue;
        }
      }
      throw error;
    }
  }
}

module.exports = { ensureAuthenticated };
