// puppeteer/screenshot.js
const path = require("path");
const fs = require("fs"); // Added for mkdirSync
const { screenshotsDir } = require("../utils/directories");
const { log } = require("../utils/logger");

// Define profile screenshots subdirectory (consistent with main screenshotsDir)
const profileScreenshotsDir = path.join(
  screenshotsDir,
  "discovered_new_profile"
);

// Ensure the profile directory exists
if (!fs.existsSync(profileScreenshotsDir)) {
  fs.mkdirSync(profileScreenshotsDir, { recursive: true });
  log(`Created profile screenshots directory: ${profileScreenshotsDir}`);
}

async function takeScreenshot(page) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(screenshotsDir, `channel-${timestamp}.png`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Channel screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    log(`Failed to take channel screenshot: ${error.message}`);
    return null;
  }
}

async function takeProfileScreenshot(page, name) {
  // Sanitize name further to avoid invalid filename characters
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `profile-${safeName}-${timestamp}.png`;
  const screenshotPath = path.join(profileScreenshotsDir, filename);

  try {
    // Focus on the profile modal area for cleaner screenshot (optional but better)
    // We crop to the modal if possible, otherwise fullPage fallback
    const modal = await page.$(
      'div[id*="popout_"], div[role="dialog"][aria-modal="true"], div[class*="user-profile-popout"], div[class*="profile"], section[aria-label*="profile"]'
    );

    if (modal) {
      await modal.screenshot({ path: screenshotPath });
      log(`Profile screenshot (modal only) saved: ${screenshotPath}`);
    } else {
      // Fallback: full page
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`Profile screenshot (full page fallback) saved: ${screenshotPath}`);
    }

    return screenshotPath;
  } catch (error) {
    log(`Failed to take profile screenshot: ${error.message}`);
    return null;
  }
}

module.exports = { takeScreenshot, takeProfileScreenshot };
