const { log } = require("../../../../utils/logger");

class ChannelNavigation {
  constructor(page) {
    this.page = page;
  }

  async openChannel(channelName) {
    log(`Opening channel: ${channelName}`);

    // Try multiple ways to find and open a channel
    const selectors = [
      `div[data-list-item-id*="channels"]:has-text("${channelName}")`,
      `[data-list-item-id*="channels___"]:has-text("${channelName}")`,
      `div[role="listitem"]:has-text("${channelName}")`,
      `a[href*="/channels/"]:has-text("${channelName}")`,
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, {
          timeout: 5000,
          visible: true,
        });
        await this.page.click(selector);

        // Wait for channel to load
        await this.page.waitForSelector('[data-list-id="chat-messages"]', {
          timeout: 10000,
        });

        log(`Successfully opened channel: ${channelName}`);
        return true;
      } catch (error) {
        continue;
      }
    }

    throw new Error(`Could not find channel: ${channelName}`);
  }

  async getChannelList() {
    return await this.page.evaluate(() => {
      const channels = [];
      const channelElements = document.querySelectorAll(
        '[data-list-item-id*="channels___"]'
      );

      channelElements.forEach((el) => {
        const name = el.textContent.trim();
        if (name) {
          const id = el.getAttribute("data-list-item-id") || "";
          const match = id.match(/channels___(\d+)/);
          channels.push({
            name,
            id: match ? match[1] : null,
            element: el,
          });
        }
      });

      return channels;
    });
  }

  async navigateToRecentChannel() {
    log("Navigating to most recent channel");

    // Click on first available channel
    const channels = await this.getChannelList();
    if (channels.length > 0) {
      await channels[0].element.click();
      await this.page.waitForSelector('[data-list-id="chat-messages"]', {
        timeout: 10000,
      });
      return channels[0].name;
    }

    throw new Error("No channels found");
  }
}

module.exports = ChannelNavigation;
