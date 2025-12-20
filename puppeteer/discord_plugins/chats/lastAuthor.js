// puppeteer/discord_plugins/messages/lastAuthor.js
const { log } = require("../../../utils/logger");
const WaitPlugin = require("../wait");

class LastAuthorPlugin {
  constructor(page, waitPlugin = null) {
    // Accept waitPlugin as parameter
    this.page = page;
    this.waitPlugin = new WaitPlugin(page);
  }

  /**
   * Find the most recent username span (clickable display name)
   * Exact replica of your working code
   */
  async findLastAuthor() {
    log("Finding the most recent username...");

    try {
      const lastAuthorSpan = await this.page.evaluateHandle(() => {
        const messageList =
          document.querySelector('ol[data-list-id="chat-messages"]') ||
          document.querySelector('[role="log"]') ||
          document.querySelector('div[class*="scrollerInner"] ul');

        if (!messageList) {
          console.log("No message list found");
          return null;
        }

        const usernameSpans = messageList.querySelectorAll(
          'span[class*="username"][role="button"]'
        );

        if (usernameSpans.length === 0) {
          console.log("No username spans found");
          return null;
        }

        console.log(`Found ${usernameSpans.length} username spans`);
        return usernameSpans[usernameSpans.length - 1];
      });

      if (!lastAuthorSpan || !(await lastAuthorSpan.asElement())) {
        log("No last author element found");
        return null;
      }

      // Get the display name
      const displayName = await lastAuthorSpan.evaluate((node) =>
        node.innerText.trim()
      );

      log(`Found last author: "${displayName}"`);

      return {
        elementHandle: lastAuthorSpan,
        displayName, // This is the correct property name
        name: displayName, // Also include as 'name' for compatibility
        text: displayName, // Also include as 'text' for compatibility
        click: async () => {
          await lastAuthorSpan.click({ delay: 200 });
          return true;
        },
      };
    } catch (error) {
      log(`Error finding last author: ${error.message}`);
      return null;
    }
  }

  /**
   * Find and click the last author in one go
   */
  async findAndClickLastAuthor() {
    log("Finding and clicking last author...");

    const lastAuthor = await this.findLastAuthor();

    if (!lastAuthor) {
      log("No last author to click");
      return null;
    }

    try {
      // Click username to open profile popout
      await lastAuthor.click();
      log(`Successfully clicked last author: "${lastAuthor.displayName}"`);

      // Wait for profile using WaitPlugin if available
      await this.waitPlugin.waitForProfilePopup({
        timeout: 15000,
        waitAfterOpen: 2000,
      });

      // Return BOTH the lastAuthor object AND the displayName separately
      return {
        ...lastAuthor,
        clicked: true,
      };
    } catch (error) {
      log(`Failed to click last author: ${error.message}`);
      return null;
    }
  }
}

module.exports = LastAuthorPlugin;
