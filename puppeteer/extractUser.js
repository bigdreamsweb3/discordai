const fs = require("fs");
const path = require("path");
const { log } = require("../utils/logger");
const DiscordPlugins = require("./discord_plugins");
const { discordBotClient } = require("../discord/bot");
const { saveBackupReport } = require("../reports/saveReport");
const { sendReportToOwner } = require("../discord/sender");
const { baseDir } = require("../utils/directories");

async function isMessageContentReady(page, messageId, username) {
  return await page.evaluate(
    ({ msgId, name }) => {
      const row = document.querySelector(`[data-list-item-id*="${msgId}"]`);
      if (!row || row.innerText.includes("Loading")) return false;
      const user = Array.from(
        row.querySelectorAll('span[class*="username"]')
      ).find((el) => el.innerText.trim() === name);
      const content = row.querySelector('[class*="messageContent"]');
      return !!user && !!content && content.innerText.trim().length > 0;
    },
    { msgId: messageId, name: username }
  );
}

async function extractUser(page, username, channelId, messageId, options = {}) {
  const { takeScreenshot = false, closeProfileAfter = true } = options;
  if (!page || !username) throw new Error("Missing parameters");
  const cleanName = username.trim();

  // === 1. CAPTURE SERVER/CHANNEL CONTEXT FROM URL ===
  const urlContext = await page.evaluate(() => {
    const parts = window.location.pathname.split("/");
    // URL: /channels/[serverId]/[channelId]
    if (parts[1] === "channels") {
      return {
        sId: parts[2], // First ID is Server
        cId: parts[3], // Second ID is Channel
      };
    }
    return { sId: "@me", cId: null };
  });

  const finalServerId = urlContext.sId;
  const finalChannelId = channelId || urlContext.cId;
  const channelUrl = `https://discord.com/channels/${finalServerId}/${finalChannelId}`;
  const deepLinkUrl = `${channelUrl}/${messageId}`;

  try {
    await page.keyboard.press("Escape");

    if (!page.url().includes(finalChannelId)) {
      await page.goto(channelUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }

    let ready = await isMessageContentReady(page, messageId, cleanName);
    if (!ready) {
      log(`⚠️ Content missing. Jumping to: ${deepLinkUrl}`);
      await page.goto(deepLinkUrl, {
        waitUntil: "networkidle2",
        timeout: 45000,
      });
    }

    // Locate and Click
    const elementHandle = await page.evaluateHandle(
      ({ msgId, name }) => {
        const row = document.querySelector(`[data-list-item-id*="${msgId}"]`);
        return Array.from(
          row?.querySelectorAll('span[class*="username"]') || []
        ).find((el) => el.innerText.trim() === name);
      },
      { msgId: messageId, name: cleanName }
    );

    const element = elementHandle.asElement();
    if (!element) throw new Error(`User "${cleanName}" not found.`);

    await element.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise((r) => setTimeout(r, 1000));
    await element.hover();
    await new Promise((r) => setTimeout(r, 500));
    await element.click({ delay: 100 });

    // Wait for popout
    await page.waitForSelector(
      '.user-profile-popout, [class*="userPopoutOuter"]',
      { visible: true, timeout: 8000 }
    );

    // === 2. EXTRACT DETAILED DATA FROM POPOUT ===
    const extractedData = await page.evaluate(() => {
      const popout = document.querySelector(
        '.user-profile-popout, [class*="userPopoutOuter"]'
      );
      if (!popout) return null;

      // A. Extract User ID from Avatar CDN
      let uId = null;
      const avatarImg = popout.querySelector('img[class*="avatar"]');
      if (avatarImg?.src.includes("avatars/")) {
        const match = avatarImg.src.match(/avatars\/(\d+)\//);
        if (match) uId = match[1];
      }
      if (!uId) {
        const idMatch = popout.innerHTML.match(/copy-id-(\d{17,20})/);
        uId = idMatch ? idMatch[1] : null;
      }

      // B. Extract Handle (Actual Username)
      const handleEl = popout.querySelector('[class*="userTagUsername"]');
      const handle = handleEl ? handleEl.innerText.trim() : "N/A";

      return { uId, handle };
    });

    const userDetails = {
      displayName: cleanName,
      username: extractedData?.handle || "N/A", // This was N/A before
      userId: extractedData?.uId || "Unknown",
      channelId: finalChannelId,
      messageId,
      serverId: finalServerId, // This will now be the real ID instead of @me
      extractedAt: new Date().toISOString(),
    };

    if (closeProfileAfter) await page.keyboard.press("Escape");

    saveBackupReport(null, userDetails);

    if (discordBotClient.isReady() && userDetails.userId !== "Unknown") {
      const owner = await discordBotClient.users.fetch(
        discordBotClient.ownerId
      );
      await sendReportToOwner(discordBotClient, owner, userDetails);
    }

    return userDetails;
  } catch (error) {
    log(`❌ Extraction Failed: ${error.message}`);
    return null;
  }
}

module.exports = { extractUser };
