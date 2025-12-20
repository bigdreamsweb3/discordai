// puppeteer/login.js (Robust login with infinite retries until success)
const { log } = require("../utils/logger");
const { takeScreenshot } = require("./screenshot");

async function loginToDiscord(page, email, password) {
  let attempt = 0;
  const maxDelay = 60000; // Max wait between retries (60 seconds)

  while (true) {
    attempt++;
    log(`Login attempt #${attempt}...`);

    try {
      // Go to login page with longer timeout
      await page.goto("https://discord.com/login", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });

      // Check for common blocks early
      const pageTitle = await page.title();
      const pageUrl = page.url();

      if (pageTitle.includes("Robot") || pageUrl.includes("captcha") || pageUrl.includes("cf-")) {
        log("Possible CAPTCHA or Cloudflare challenge detected. Waiting and retrying...");
        await takeScreenshot(page, `login-blocked-attempt-${attempt}`);
        await new Promise(r => setTimeout(r, 15000 + Math.random() * 10000));
        continue;
      }

      // Fill credentials
      await page.waitForSelector('input[name="email"]', { timeout: 30000 });
      await page.type('input[name="email"]', email, { delay: 100 });

      await page.waitForSelector('input[name="password"]', { timeout: 10000 });
      await page.type('input[name="password"]', password, { delay: 100 });

      // Submit login
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({
          waitUntil: "networkidle0",
          timeout: 90000,
        }).catch(() => log("Navigation after login took too long — continuing anyway")),
      ]);

      // Wait for successful login indicator: the servers sidebar
      await page.waitForSelector('nav[aria-label="Servers sidebar"]', {
        timeout: 60000,
      });

      // Extra confirmation: check if we're no longer on /login
      const currentUrl = page.url();
      if (currentUrl.includes("/app") || currentUrl.includes("/channels")) {
        log("Logged in successfully!");
        await takeScreenshot(page, "login-success-final");
        return; // SUCCESS — exit the function
      }

    } catch (error) {
      log(`Login attempt #${attempt} failed: ${error.message}`);

      // Take screenshot for debugging
      await takeScreenshot(page, `login-failed-attempt-${attempt}`).catch(() => {});

      // Check if page has error messages (wrong password, etc.)
      const errorText = await page.evaluate(() => {
        return document.querySelector('[class*="error"]')?.innerText ||
               document.querySelector('[class*="lookFilled"]')?.innerText ||
               null;
      });

      if (errorText && errorText.toLowerCase().includes("password")) {
        log(`FATAL: Invalid credentials detected: "${errorText}"`);
        throw new Error("Invalid email or password — stopping login attempts");
      }
    }

    // Wait before next attempt (exponential backoff + jitter)
    const delay = Math.min(10000 + attempt * 5000 + Math.random() * 10000, maxDelay);
    log(`Waiting ${Math.round(delay / 1000)} seconds before next login attempt...`);
    await new Promise(r => setTimeout(r, delay));
  }
}

module.exports = { loginToDiscord };