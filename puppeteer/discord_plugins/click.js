// FILE: ./puppeteer/discord_plugins/ui/channels/clicks.js
const { log } = require("../../utils/logger");

class ClickPlugin {
  constructor(page) {
    this.page = page;
  }

  async clickSpan(content, options = {}) {
    const { delay = 100, ...clickOptions } = options;

    try {
      if (typeof content === "string") {
        // Handle selector string
        await this.page.waitForSelector(content, { visible: true });
        await this.page.click(content, { delay, ...clickOptions });
        return true;
      } else if (content && content.elementHandle) {
        // Handle object with elementHandle property
        await content.elementHandle.click({ delay, ...clickOptions });
        return true;
      } else if (content && content._remoteObject) {
        // Handle raw element handle
        await content.click({ delay, ...clickOptions });
        return true;
      } else {
        log("Invalid content type for clickSpan");
        return false;
      }
    } catch (error) {
      log(`Failed to click element: ${error.message}`);
      return false;
    }
  }

  // ... rest of your ClickPlugin methods ...
}

module.exports = ClickPlugin;
