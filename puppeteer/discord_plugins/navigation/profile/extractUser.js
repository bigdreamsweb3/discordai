const { log } = require("../../../../utils/logger");

class UserExtractor {
  constructor(page) {
    this.page = page;
  }

  async extractUserId() {
    log("Extracting User ID from profile modal");

    let userId = null;

    try {
      // Open More menu
      await this.page.waitForSelector(
        '[aria-label="More"][role="button"][class*="bannerButton"]',
        { timeout: 8000, visible: true }
      );

      await this.page.click(
        '[aria-label="More"][role="button"][class*="bannerButton"]'
      );
      log("More menu opened");

      // Wait for overflow menu
      await this.page.waitForSelector(
        'div[role="menu"][aria-label="Profile Actions"]',
        { timeout: 10000, visible: true }
      );
      log("Profile overflow menu opened");

      await new Promise((r) => setTimeout(r, 800));

      // Try to click "Copy User ID" and get the ID
      userId = await this.page.evaluate(async () => {
        const copyButtons = Array.from(
          document.querySelectorAll('div[role="menuitem"]')
        ).filter((el) => el.textContent?.includes("Copy User ID"));

        if (copyButtons.length > 0) {
          const button = copyButtons[0];
          button.click();

          // Wait for clipboard
          await new Promise((resolve) => setTimeout(resolve, 500));

          try {
            return await navigator.clipboard.readText();
          } catch (clipboardErr) {
            // Fallback: extract from element attributes
            const buttonId = button.id || "";
            const match = buttonId.match(/-copy-id-(\d{17,19})$/);
            if (match) return match[1];

            // Check data attributes
            const dataId =
              button.getAttribute("data-user-id") ||
              button.closest("[data-user-id]")?.getAttribute("data-user-id");
            if (dataId && dataId.match(/\d{17,19}/)) {
              return dataId.match(/\d{17,19}/)[0];
            }
          }
        }
        return null;
      });

      if (userId) {
        log(`Extracted User ID: ${userId}`);
      } else {
        log("Could not extract User ID");
      }

      // Close menu
      await this.page.keyboard.press("Escape");
    } catch (err) {
      log(`Error extracting User ID: ${err.message}`);
      // Try direct extraction from modal
      userId = await this.extractUserIdDirectly();
    }

    return userId;
  }

  async extractUserIdDirectly() {
    return await this.page.evaluate(() => {
      const modal = document.querySelector(
        'div[role="dialog"][aria-modal="true"]'
      );
      if (!modal) return null;

      // Look for any 17-19 digit number in the modal
      const text = modal.innerText;
      const idMatch = text.match(/\b\d{17,19}\b/);

      if (idMatch) return idMatch[0];

      // Check data attributes
      const elementsWithData = modal.querySelectorAll(
        "[data-user-id], [data-user], [data-user-id]"
      );
      for (const el of elementsWithData) {
        const dataId =
          el.getAttribute("data-user-id") || el.getAttribute("data-user");
        if (dataId && dataId.match(/\d{17,19}/)) {
          return dataId.match(/\d{17,19}/)[0];
        }
      }

      return null;
    });
  }

  async extractDisplayName() {
    return await this.page.evaluate(() => {
      const modal = document.querySelector(
        'div[role="dialog"][aria-modal="true"]'
      );
      if (!modal) return null;

      // Look for display name in header
      const header = modal.querySelector(
        'h1, h2, h3, [class*="header"], [class*="title"]'
      );
      if (header) return header.textContent.trim();

      // Fallback to first large text
      const allText = modal.innerText
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      return allText.length > 0 ? allText[0] : null;
    });
  }
}

module.exports = UserExtractor;
