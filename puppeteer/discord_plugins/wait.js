const { log } = require("../../utils/logger");

class WaitPlugin {
  constructor(page) {
    this.page = page;
  }

  async waitForProfilePopup(options = {}) {
    const {
      timeout = 15000,
      visible = true,
      checkInterval = 1000,
      maxAttempts = 10,
      // Additional profile-specific options
      waitAfterOpen = 2000, // Wait after profile opens for content to load
      verifyContent = true, // Check if profile has content
    } = options;

    log("Waiting for profile popup to open...");

    const selector = 'div[role="dialog"][aria-modal="true"]';

    try {
      // Wait for profile modal/popout (very reliable ARIA selector)
      await this.page.waitForSelector(selector, {
        visible,
        timeout,
      });

      log("✓ Profile popup opened successfully");
      return true;
    } catch (error) {
      log(`✗ Failed to wait for profile popup: ${error.message}`);
    }
  }

  async forProfilePopupMoreButton(options = {}) {
    const {
      timeout = 8000,
      visible = true,
      throwIfMissing = false,
      parentContext = null, // Optional: search within specific element
    } = options;

    log("Waiting for More action button to be visible...");

    const selector =
      '[aria-label="More"][role="button"][class*="bannerButton"]';

    try {
      if (parentContext) {
        // Search within a specific context (e.g., profile popup)
        await parentContext.waitForSelector(selector, {
          visible,
          timeout,
        });
      } else {
        // Search globally
        await this.page.waitForSelector(selector, {
          visible,
          timeout,
        });
      }

      log("✓ More button found and visible");
      return true;
    } catch (error) {
      const errorMsg = `✗ More button not visible after ${timeout}ms`;

      if (throwIfMissing) {
        throw new Error(errorMsg);
      } else {
        log(errorMsg);
        return false;
      }
    }
  }

  async waitForProfileMoreActionMenu(options = {}) {
    const {
      timeout = 15000,
      visible = true,
      checkInterval = 1000,
      maxAttempts = 10,
      // Additional profile-specific options
      waitAfterOpen = 2000, // Wait after profile opens for content to load
      verifyContent = true, // Check if profile has content
    } = options;

    log("Waiting for profile more action menu to open...");

    const selector = 'div[role="menu"][aria-label="Profile Actions"]';

    try {
      // Wait for profile more action menu/popout (very reliable ARIA selector)
      await this.page.waitForSelector(selector, {
        visible,
        timeout,
      });

      log("✓ Profile popup more action menu/popout opened successfully");
      return true;
    } catch (error) {
      log(
        `✗ Failed to wait for profile popup more action menu: ${error.message}`
      );
    }
  }

  async forLoad(options = {}) {
    const { timeout = 2000 } = options;

    log("Waiting...");

    await new Promise((r) => setTimeout(r, timeout));
  }

  async waitForNetworkIdle(timeout = 30000) {
    log("Waiting for network idle...");

    await this.page.waitForNetworkIdle({ timeout, idleTime: 1000 });
    log("Network idle");
  }

  async waitForElementToDisappear(selector, timeout = 10000) {
    log(`Waiting for element to disappear: ${selector}`);

    try {
      await this.page.waitForSelector(selector, { timeout, hidden: true });
      log(`Element disappeared: ${selector}`);
      return true;
    } catch (error) {
      log(`Element still visible: ${selector}`);
      return false;
    }
  }
}

module.exports = WaitPlugin;
