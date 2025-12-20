// puppeteer/discordAuth.js
const fs = require("fs");
const path = require("path");
const { log } = require("../utils/logger");
const { loginToDiscord } = require("./login"); // Optional: only if you keep automated fallback

const TOKEN_FILE = path.join(__dirname, "../discord/discord-token.txt");

async function ensureAuthenticated(page) {
  // Always start from the app to leverage persistent session
  await page.goto("https://discord.com/app", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });

  let loggedIn = false;

  // Step 1: Try token injection if token file exists
  if (fs.existsSync(TOKEN_FILE)) {
    const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();

    log("Attempting login via saved token injection...");
    await page.evaluate((t) => {
      localStorage.setItem('"token"', `"${t}"`);
      window.location.reload();
    }, token);

    try {
      await page.waitForSelector('nav[aria-label="Servers sidebar"]', {
        timeout: 30000,
      });
      log("Logged in successfully via saved token");
      loggedIn = true;
    } catch (e) {
      log("Saved token invalid or expired");
      // Optionally delete bad token
      // fs.unlinkSync(TOKEN_FILE);
    }
  }

  // Step 2: Check if already logged in via persistent session (most common success case)
  if (!loggedIn) {
    const currentUrl = await page.url();
    if (currentUrl.includes("/channels") || currentUrl.includes("/app")) {
      try {
        await page.waitForSelector('nav[aria-label="Servers sidebar"]', {
          timeout: 15000,
        });
        log("Already logged in via persistent session! (No action needed)");
        loggedIn = true;

        // Bonus: Backup the current token if not already saved
        if (!fs.existsSync(TOKEN_FILE)) {
          try {
            const currentToken = await page.evaluate(() => {
              const t = localStorage.getItem('"token"');
              return t ? t.replace(/^"|"$/g, "") : null;
            });
            if (currentToken) {
              fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
              fs.writeFileSync(TOKEN_FILE, currentToken);
              log("Current session token backed up for future use");
            }
          } catch (backupErr) {
            log("Could not backup token");
          }
        }
      } catch (e) {
        log("Sidebar not found despite app URL — session may be invalid");
      }
    }
  }

  // Step 3: Final fallback — automated email/password login (rarely needed)
  if (!loggedIn) {
    log("No valid session or token — falling back to email/password login");
    const { EMAIL, PASSWORD } = require("../config/env");
    await loginToDiscord(page, EMAIL, PASSWORD);
    loggedIn = true; // Assume success since loginToDiscord loops until success or fatal error
  }

  if (loggedIn) {
    log("Authentication successful — ready to proceed");
  } else {
    throw new Error("Failed to authenticate with Discord after all attempts");
  }
}

module.exports = { ensureAuthenticated };
