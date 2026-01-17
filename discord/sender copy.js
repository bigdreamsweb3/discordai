const { log } = require("../utils/logger");

async function sendReportToOwner(client, ownerUser, userDetails = null) {
  try {
    const owner = ownerUser;
    if (!owner) return;

    // 1. Construct Jump Link
    const channelLink = `https://discord.com/channels/${
      userDetails?.serverId || "@me"
    }/${userDetails?.channelId}/${userDetails?.messageId || ""}`;

    // 2. Build the compact text report
    let reportContent = `━━━━━━━━━━━━━━━━━━━━\n`;
    reportContent += `🔔 **NEW PROFILE DETECTED**\n`;
    reportContent += `🕒 *${new Date().toLocaleString()}*\n`;
    reportContent += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    reportContent += `📍 **Source Location**\n`;
    reportContent += `• [Jump to Message](${channelLink})\n\n`;

    reportContent += `🧠 **PROFILE INTELLIGENCE**\n`;
    reportContent += `👤 **Name:** ${userDetails?.displayName || "N/A"}\n`;
    reportContent += `🆔 **ID:** \`${userDetails?.userId || "Unknown"}\`\n`;
    reportContent += `📛 **User:** ${userDetails?.username || "N/A"}\n\n`;

    reportContent += `🔗 **Quick Actions**\n`;
    reportContent += `• [View Profile](https://discord.com/users/${userDetails?.userId})\n`;
    reportContent += `• [Send DM](https://discord.com/channels/@me/${userDetails?.userId})\n\n`;

    reportContent += `━━━━━━━━━━━━━━━━━━━━`;

    // 3. Send text only (No files = No memory bloat)
    await owner.send({ content: reportContent });

    log(`✅ Text report sent to owner for ${userDetails?.displayName}`);
  } catch (error) {
    if (error.code === 50007) {
      log(
        "❌ DM Failed: Owner must enable 'Allow direct messages from server members'."
      );
    } else {
      log(`❌ DM Failed: ${error.message}`);
    }
  }
}

module.exports = { sendReportToOwner };
