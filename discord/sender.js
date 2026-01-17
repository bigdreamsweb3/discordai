const { log } = require("../utils/logger");

async function sendReportToOwner(client, ownerUser, userDetails = null) {
  try {
    const reportChannelId = "1461486170897776714";
    const reportGuildId = "1461486170117640466";

    if (!client || !client.isReady()) return;

    const guild = await client.guilds.fetch(reportGuildId).catch(() => null);
    const logChannel = await guild?.channels
      .fetch(reportChannelId)
      .catch(() => null);

    if (!logChannel) return;

    const sId = userDetails?.serverId;
    const cId = userDetails?.channelId;
    const mId = userDetails?.messageId;
    const uId = userDetails?.userId;

    // Logic to check if numeric or @me
    const isRealServer = sId && sId !== "@me" && /^\d+$/.test(sId);
    const jumpLink = `<https://discord.com/channels/${sId}/${cId}/${mId}>`;
    const serverLink =
      `<https://discord.com/channels/${sId}>` || "N/A (Direct Message)";

    let reportContent = `**─── [ USER INTELLIGENCE DOSSIER ] ───**\n\n`;

    reportContent += `👤 **IDENTIFICATION**\n`;
    reportContent += `> **Display Name:** ${
      userDetails?.displayName || "Unknown"
    }\n`;
    reportContent += `> **Username:** ${
      userDetails?.username?.startsWith("@")
        ? userDetails.username
        : "@" + userDetails?.username
    }\n`;
    reportContent += `> **User ID:** \`${uId}\`\n\n`;

    reportContent += `📍 **SOURCE DATA**\n`;
    reportContent += `> **Original Server ID:** \`${sId || "DM"}\`\n`;
    reportContent += `> **Original Channel ID:** \`${cId}\`\n`;
    reportContent += `> **Server Link:** ${serverLink}\n`;
    reportContent += `> **Jump to Message:** ${jumpLink}\n\n`;

    reportContent += `🛠️ **QUICK ACTIONS**\n`;
    reportContent += `• **Full Profile:** <https://discord.com/users/${uId}>\n`;
    reportContent += `• **Direct Message:** <https://discord.com/channels/@me/${uId}>\n\n`;

    reportContent += `🕒 *Captured on: ${new Date().toLocaleString()}*\n`;
    reportContent += `**────────────────────────────**`;

    await logChannel.send({ content: reportContent });
    log(`✅ Dossier posted for: ${userDetails?.displayName}`);
  } catch (error) {
    log(`❌ Sender Error: ${error.message}`);
  }
}

module.exports = { sendReportToOwner };
