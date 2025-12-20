const { log } = require("../../../../utils/logger");
const ClickPlugin = require("../../click");

class ProfileOpener {
  constructor(page) {
    this.page = page;
    this.clicker = new ClickPlugin(page);
  }

  async openProfileFromUsername(username) {
    log(`Opening profile for: ${username}`);

    const selector = `span[class*="username"][role="button"]:has-text("${username}")`;

    try {
      await this.clicker.clickWithRetry(selector);

      // Wait for profile modal
      await this.page.waitForSelector('div[role="dialog"][aria-modal="true"]', {
        timeout: 15000,
        visible: true,
      });

      log(`Profile modal opened for: ${username}`);
      return true;
    } catch (error) {
      log(`Failed to open profile: ${error.message}`);
      return false;
    }
  }

  async openProfileFromMessage(messageSelector) {
    log("Opening profile from message");

    // Find username in a message and click it
    const usernameElement = await this.page.evaluateHandle((selector) => {
      const message = document.querySelector(selector);
      if (!message) return null;

      return message.querySelector('span[class*="username"][role="button"]');
    }, messageSelector);

    if (usernameElement && (await usernameElement.asElement())) {
      await usernameElement.click({ delay: 200 });

      await this.page.waitForSelector('div[role="dialog"][aria-modal="true"]', {
        timeout: 15000,
        visible: true,
      });

      log("Profile modal opened from message");
      return true;
    }

    return false;
  }

  async closeProfile() {
    try {
      await this.page.keyboard.press("Escape");
      log("Profile modal closed");
      return true;
    } catch (error) {
      log(`Error closing profile: ${error.message}`);
      return false;
    }
  }
}

module.exports = ProfileOpener;
