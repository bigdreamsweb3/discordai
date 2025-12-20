const fs = require("fs");
const path = require("path");
const { log } = require("../utils/logger");
const { takeProfileScreenshot } = require("./screenshot");
const DiscordPlugins = require("./discord_plugins");
const { discordBotClient } = require("../discord/bot");
const { saveBackupReport } = require("../reports/saveReport");
const { sendReportToOwner } = require("../discord/sender");

async function extractUser(page, username, channelId, messageId, options = {}) {
  const { takeScreenshot = true, closeProfileAfter = true } = options;

  if (!page) throw new Error("Page instance required");
  if (!username || typeof username !== "string") {
    throw new Error("Valid username/displayName is required");
  }
  if (!channelId || !messageId) {
    throw new Error("channelId and messageId are required");
  }

  const channelLink = await page.url();

  const cleanName = username.trim();
  log(`Extracting profile for user: ${cleanName} (messageId: ${messageId})`);

  const plugins = new DiscordPlugins(page);
  let screenshotPath = null;
  let userId = null;

  await plugins.wait.forLoad({ timeout: 3000 });

  try {
    // === STEP 0: Find the clickable username element ===
    log(`Searching for username "${cleanName}" in message ${messageId}...`);

    const messageItemSelector = `chat-messages___chat-messages-${channelId}-${messageId}`;

    const authorSelector = await page.evaluate(
      ({ name, chanId, msgId, messageItemSelector }) => {
        const messageList =
          document.querySelector('ol[data-list-id="chat-messages"]') ||
          document.querySelector('ul[data-list-id="chat-messages"]');

        if (!messageList) return null;

        // First: try to find the exact message container
        const exactMessage = messageList.querySelector(
          `[data-list-item-id="${messageItemSelector}"]`
        );
        if (exactMessage) {
          const span = exactMessage.querySelector(
            'span[class*="username"][role="button"]'
          );
          if (span && span.innerText.trim() === name.trim()) {
            return `[data-list-item-id="${messageItemSelector}"] span[class*="username"][role="button"]`;
          }
        }

        // Fallback: search all usernames
        const usernames = messageList.querySelectorAll(
          'span[class*="username"][role="button"]'
        );
        for (const span of usernames) {
          if (span.innerText.trim() === name.trim()) {
            const item = span.closest("[data-list-item-id]");
            if (item) {
              return `[data-list-item-id="${item.getAttribute(
                "data-list-item-id"
              )}"] span[class*="username"][role="button"]`;
            }
          }
        }

        return null;
      },
      {
        name: cleanName,
        chanId: channelId,
        msgId: messageId,
        messageItemSelector,
      }
    );

    if (!authorSelector) {
      throw new Error(`Could not find clickable username for "${cleanName}"`);
    }

    log(`Found username selector: ${authorSelector}`);

    // === CRITICAL: Scroll the message into view ===
    log(`Scrolling message ${messageId} into view...`);

    const messageItemId = `chat-messages___chat-messages-${channelId}-${messageId}`;

    const scrolled = await page.evaluate((itemId) => {
      const messageItem = document.querySelector(
        `[data-list-item-id="${itemId}"]`
      );
      if (messageItem) {
        messageItem.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        return true;
      }
      return false;
    }, messageItemId);

    if (!scrolled) {
      throw new Error(
        `Failed to find or scroll message container: ${messageItemId}`
      );
    }

    log("Message scrolled into view");

    // Wait for smooth scroll + rendering
    await plugins.wait.forLoad({ timeout: 1500 });

    // Now wait for the clickable username to be visible
    await page.waitForSelector(authorSelector, {
      visible: true,
      timeout: 15000,
    });

    // Double-check visibility
    const elementHandle = await page.$(authorSelector);
    if (!elementHandle) {
      throw new Error("Username element not visible after scrolling");
    }

    // Optional: hover to trigger any lazy load
    await elementHandle.hover();
    await plugins.wait.forLoad({ timeout: 500 });

    // === Click it ===
    await elementHandle.click({ delay: 200 });
    log("Clicked username → profile opened");

    await plugins.wait.forLoad({ timeout: 6000 });

    if (takeScreenshot) {
      screenshotPath = await takeProfileScreenshot(page, cleanName);
      log(`Profile screenshot saved: ${screenshotPath}`);
    }

    // === Extract User ID via "More" menu ===
    try {
      await plugins.wait.forProfilePopupMoreButton({
        timeout: 8000,
        waitAfterOpen: 2000,
      });

      await page.click(
        '[aria-label="More"][role="button"][class*="bannerButton"]'
      );
      log("More Action Menu Clicked!");

      await plugins.wait.waitForProfileMoreActionMenu({
        timeout: 15000,
        waitAfterOpen: 2000,
      });

      userId = await page.evaluate(async () => {
        const copyButtons = Array.from(
          document.querySelectorAll('div[role="menuitem"]')
        ).filter(
          (el) =>
            el.textContent?.includes("Copy User ID") ||
            el.textContent?.includes("Copy ID")
        );

        if (copyButtons.length > 0) {
          const button = copyButtons[0];
          button.click();

          await new Promise((resolve) => setTimeout(resolve, 500));

          try {
            return await navigator.clipboard.readText();
          } catch {
            const buttonId = button.id || "";
            const match = buttonId.match(/-copy-id-(\d{17,19})$/);
            return match ? match[1] : null;
          }
        }
        return null;
      });

      log(
        userId ? `Extracted User ID: ${userId}` : "Could not extract User ID"
      );

      await page.keyboard.press("Escape"); // Close menu
    } catch (err) {
      log(`Failed to extract User ID: ${err.message}`);
    }

    if (closeProfileAfter) {
      await page.keyboard.press("Escape"); // Close profile
    }

    await page.keyboard.press("Escape"); // Close profile

    await page.keyboard.press("Escape"); // Close profile

    // === Build user details object ===
    const userDetails = {
      displayName: cleanName,
      username: username,
      userId,
      profileScreenshot: screenshotPath,
      source: "message_author_click",
      channelId,
      serverId: channelLink.match(/channels\/(\d+|\@me)\//)[1], // extracts guild ID or @me
      messageId,
      extractedAt: new Date().toISOString(),
    };

    // === Send report to owner via Discord bot ===
    if (discordBotClient.isReady() && userId) {
      try {
        const owner = await discordBotClient.users.fetch(
          discordBotClient.ownerId
        );
        const attachments = screenshotPath ? [screenshotPath] : [];

        // Assuming sendReportToOwner signature: (client, ownerUser, attachments[], userData)
        // Adjust if your function signature is different
        await sendReportToOwner(
          discordBotClient,
          owner,
          attachments,
          userDetails
        );

        log("Report successfully sent to bot owner via DM");
      } catch (err) {
        log(`Failed to send report to owner: ${err.message}`);
      }
    } else {
      log("Skipping DM report (bot not ready or no user ID extracted)");
    }

    // === Always save local backup ===
    saveBackupReport(null, userDetails);
    log("Local backup report saved");

    // === Return result ===
    return userDetails; // Single object (not array) — consistent with extracting one user
  } catch (error) {
    log(`Error during user extraction: ${error.message}`);
    try {
      const errorPath = `error-extraction-${cleanName.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}-${Date.now()}.png`;
      await page.screenshot({ path: errorPath, fullPage: true });
      log(`Debug screenshot saved: ${errorPath}`);
    } catch (screenshotErr) {
      // Ignore
    }
    return null; // or {} if you prefer
  }
}

module.exports = { extractUser };
