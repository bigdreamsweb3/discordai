const { log } = require("../../../utils/logger");

class UsernameFinder {
  constructor(page) {
    this.page = page;
  }

  /**
   * Find the most recent username
   * @param {Object} options - Filter options
   * @returns {Object|null} Last username element handle and data
   */
  async findLastUsername(options = {}) {
    const {
      includeHandle = true,
      includeIndex = true,
      usernameFilter = null,
      offset = 0,
      onlyVisible = true,
      clickable = true, // ← New option to ensure element is clickable
    } = options;

    try {
      // Execute in browser context to find elements
      const usernameSpansHandle = await this.page.evaluateHandle(() => {
        const messageList =
          document.querySelector('ol[data-list-id="chat-messages"]') ||
          document.querySelector('[role="log"]') ||
          document.querySelector('div[class*="scrollerInner"] ul');

        if (!messageList) return [];

        const usernameSpans = messageList.querySelectorAll(
          'span[class*="username"][role="button"], ' +
            'span[class*="username"]:has(> [role="button"]), ' +
            '[data-author] span[class*="username"]'
        );

        // Convert NodeList to array
        return Array.from(usernameSpans);
      });

      // Get the properties from the handle
      const count = await usernameSpansHandle.evaluate((arr) => arr.length);

      if (count === 0) {
        await usernameSpansHandle.dispose();
        return null;
      }

      // Get the last element
      const lastUsernameHandle = await usernameSpansHandle.evaluateHandle(
        (arr, targetIndex) => {
          return arr[targetIndex];
        },
        targetIndex
      );

      // Check if element is clickable
      if (clickable) {
        const isClickable = await lastUsernameHandle.evaluate((element) => {
          // Check if element or parent has click event listener
          const style = window.getComputedStyle(element);
          return (
            style.cursor === "pointer" ||
            element.hasAttribute("role") ||
            element.closest('[role="button"]') !== null
          );
        });

        if (!isClickable) {
          log.warn("Username element may not be clickable");
        }
      }

      // Dispose of the array handle
      await usernameSpansHandle.dispose();

      const result = {
        text: targetData.text,
        ...(includeIndex && { index: targetData.index, position: targetIndex }),
        ...(includeHandle &&
          lastUsernameHandle && { elementHandle: lastUsernameHandle }),
      };

      return result;
    } catch (error) {
      log.error("Error finding last username:", error);
      return null;
    }
  }
}

module.exports = UsernameFinder;
