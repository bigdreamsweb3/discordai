const fs = require("fs");
const path = require("path");
const { log } = require("../utils/logger");
const DiscordPlugins = require("../puppeteer/discord_plugins");

// Helper: Split long text into chunks under Discord's 2000 char limit
function chunkText(text, maxLength = 1900) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let currentChunk = "";

  for (const line of text.split("\n")) {
    if ((currentChunk + line + "\n").length > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

async function sendReportToOwner(
  client,
  ownerUser,
  screenshotPaths = [],
  userDetails = null
) {
  const plugins = new DiscordPlugins();

  try {
    const owner = ownerUser;

    // Normalize screenshot paths
    let paths = [];
    if (typeof screenshotPaths === "string") paths = [screenshotPaths];
    else if (Array.isArray(screenshotPaths)) paths = screenshotPaths;

    paths = paths.filter((p) => typeof p === "string" && fs.existsSync(p));

    // === 1. HEADER (tight spacing) ===
    const header = `━━━━━━━━━━━━━━━━━━━━
🔔 **NEW PROFILE DETECTED**
🕒 *${new Date().toLocaleString()}*
━━━━━━━━━━━━━━━━━━━━`;

    await owner.send(header);

    // === 2. SOURCE LOCATION ===
    if (userDetails?.channelId) {
      let channelLink = `https://discord.com/channels/${
        userDetails.serverId || "@me"
      }/${userDetails.channelId}`;

      if (userDetails.messageId) {
        channelLink += `/${userDetails.messageId}`;
      }

      await owner.send(
        `📍 **Source Location**
• Server / Channel: [Jump to Message](${channelLink})`
      );
    }

    // === 3. SCREENSHOTS ===
    if (paths.length > 0) {
      const files = paths.map((p) => ({
        attachment: p,
        name: path.basename(p),
      }));

      await owner.send({ files });
      log(`Sent ${paths.length} screenshot(s) to owner`);
    }

    // === 4. PROFILE INTELLIGENCE ===
    if (userDetails?.userId) {
      let details = `━━━━━━━━━━━━━━━━━━━━
🧠 **PROFILE INTELLIGENCE**
━━━━━━━━━━━━━━━━━━━━
👤 **Display Name**
${userDetails.displayName || "N/A"}

🆔 **User ID**
\`${userDetails.userId}\`

🔗 **Quick Actions**`;

      const viewProfile = plugins.link.convertToMarkdownLink(
        userDetails.userId,
        "View Profile"
      );
      if (viewProfile !== "N/A") details += `\n• ${viewProfile}`;

      const dmLink = plugins.link.convertToMarkdownLink(
        userDetails.userId,
        "Send Message"
      );
      if (dmLink !== "N/A") details += `\n• ${dmLink}`;

      details += `\n\n📛 **Username**
${userDetails.username || "N/A"}`;

      await owner.send(details);
    } else if (userDetails) {
      await owner.send(
        "⚠️ **User ID not extracted** (Developer Mode off or rate-limited)."
      );
    }

    // === 5. FOOTER (compact & confident) ===
    const footer = `━━━━━━━━━━━━━━━━━━━━
✅ **Report delivered successfully**
━━━━━━━━━━━━━━━━━━━━`;

    await owner.send(footer);

    log("Full report successfully sent to owner via DM!");
  } catch (error) {
    log(`Failed to send report to owner: ${error.message}`);
    if (error.code === 50007) {
      log("Cannot send DM — owner has DMs closed or blocked the bot");
    } else if (error.code === 10013) {
      log("Unknown user — owner ID may be invalid");
    }
  }
}

module.exports = { sendReportToOwner };
