// discord/utils/userIdLink.js
const { log } = require("../../utils/logger");

class LinkPlugin {
  constructor() {
    // No page needed, this is a pure utility
  }

  /**
   * Convert a Discord user ID to a clickable Discord link
   * @param {string} userId - Discord user ID
   * @returns {string} Clickable Discord link
   */
  convertToLink(userId) {
    if (!userId || typeof userId !== "string") {
      log(`Invalid user ID provided: ${userId}`);
      return "N/A";
    }

    // Clean the ID (remove any whitespace or special characters)
    const cleanId = userId.trim().replace(/[^\d]/g, "");

    if (!cleanId || cleanId.length < 17 || cleanId.length > 20) {
      log(`Invalid Discord user ID format: ${cleanId}`);
      return "N/A";
    }

    // Discord user link format: https://discord.com/users/123456789012345678
    return `<https://discord.com/users/${cleanId}>`;
  }

  /**
   * Convert a Discord user ID to a Markdown link
   * @param {string} userId - Discord user ID
   * @param {string} displayText - Optional display text (defaults to ID)
   * @returns {string} Markdown formatted link
   */
  convertToMarkdownLink(userId, displayText = null) {
    const link = this.convertToLink(userId);

    if (link === "N/A") {
      return "N/A";
    }

    const text = displayText || userId;
    return `[${text}](${link})`;
  }

  /**
   * Convert an array of user IDs to an array of links
   * @param {Array|string} userData - Single user ID, array of IDs, or array of user objects
   * @returns {Array} Array of converted links or objects with links
   */
  convertToLinks(userData) {
    if (!userData) return [];

    // If it's a single string ID
    if (typeof userData === "string") {
      const link = this.convertToLink(userData);
      return link === "N/A" ? [] : [link];
    }

    // If it's an array of strings (IDs)
    if (
      Array.isArray(userData) &&
      userData.length > 0 &&
      typeof userData[0] === "string"
    ) {
      return userData
        .map((id) => this.convertToLink(id))
        .filter((link) => link !== "N/A");
    }

    // If it's an array of user objects (like from your report)
    if (
      Array.isArray(userData) &&
      userData.length > 0 &&
      typeof userData[0] === "object"
    ) {
      return userData.map((user) => {
        const link = user.userId ? this.convertToLink(user.userId) : "N/A";
        return {
          ...user,
          discordLink: link,
          markdownLink:
            link !== "N/A"
              ? this.convertToMarkdownLink(
                  user.userId,
                  user.displayName || user.userId
                )
              : "N/A",
        };
      });
    }

    return [];
  }

  /**
   * Format a user report with clickable links
   * @param {Object} user - User object from your extractor
   * @returns {string} Formatted report with clickable links
   */
  formatUserReportWithLinks(user) {
    if (!user || !user.userId || user.userId === "null") {
      return "No user ID available";
    }

    const link = this.convertToLink(user.userId);
    const markdownLink = this.convertToMarkdownLink(
      user.userId,
      user.displayName || user.userId
    );

    return (
      `**User Details**\n` +
      `• **Display Name**: ${user.displayName || "N/A"}\n` +
      `• **Real Username**: ${
        user.realUsername !== "null" ? user.realUsername : "N/A"
      }\n` +
      `• **UserID**: ${user.userId !== "null" ? user.userId : "N/A"}\n` +
      `• **Profile Link**: ${link !== "N/A" ? link : "N/A"}\n` +
      `• **Clickable**: ${markdownLink}\n` +
      `• **Bio**: ${user.bio !== "null" ? user.bio : "N/A"}\n` +
      `• **Server Join**: ${
        user.memberSince !== "null" ? user.memberSince : "N/A"
      }\n` +
      `• **Discord Join**: ${
        user.discordJoined !== "null" ? user.discordJoined : "N/A"
      }\n` +
      (user.hasBanner !== "null" ? `• Has Banner\n` : "")
    );
  }

  /**
   * Validate if a string is a valid Discord user ID
   * @param {string} id - ID to validate
   * @returns {boolean} True if valid
   */
  isValidUserId(id) {
    if (!id || typeof id !== "string") return false;

    const cleanId = id.trim().replace(/[^\d]/g, "");
    return cleanId.length >= 17 && cleanId.length <= 20;
  }
}

module.exports = LinkPlugin;
