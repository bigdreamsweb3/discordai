// puppeteer/discord_plugins/navigation/channels/chats/channelMonitor.js
const { log, error } = require("../../../utils/logger");
const WaitPlugin = require("../wait");

class ChannelMonitorPlugin {
  constructor(page, waitPlugin = null) {
    this.page = page;
    this.waitPlugin = waitPlugin || new WaitPlugin(page);
    this.monitoring = false;
    this.messageHandlers = [];
    this.messageCache = new Set();
  }

  onNewMessage(handler) {
    this.messageHandlers.push(handler);
  }

  async extractMessageData(authorSpan) {
    return await this.page.evaluate((span) => {
      if (!span) return null;

      // Skip if inside a reply preview (we don't want @mentions from replies)
      if (span.closest('.repliedMessage, [class*="repliedMessage"]')) {
        return null;
      }

      const messageLi = span.closest("li");
      if (!messageLi || !messageLi.id?.startsWith("chat-messages-")) {
        return null;
      }

      // Extract channelId and messageId
      const idMatch = messageLi.id.match(/chat-messages-.*?(\d+)-(\d+)/);
      if (!idMatch) return null;

      const channelId = idMatch[1];
      const messageId = idMatch[2];

      const author = span.textContent.trim();

      // Safety: skip if starts with @ (shouldn't happen with main header, but extra guard)
      if (author.startsWith("@")) return null;

      // Get message content
      const contentEl = messageLi.querySelector(
        '[class*="messageContent"], [id^="message-content-"]'
      );
      const content = contentEl ? contentEl.textContent.trim() : "";

      // Get timestamp
      const timeEl = messageLi.querySelector("time");
      const timestamp = timeEl ? timeEl.getAttribute("datetime") : null;

      // === Detect if this message is a reply ===
      const replyContext = messageLi.querySelector(
        '.repliedMessage, [class*="repliedMessage"]'
      );
      let replyTo = null;

      if (replyContext) {
        const replyAuthorNameSpan = replyContext.querySelector(
          'span[class*="username"]'
        );
        const replyAuthorName = replyAuthorNameSpan
          ? replyAuthorNameSpan.textContent.trim().replace(/^@/, "")
          : null;

        // Extract replied message ID from id="message-reply-context-XXXX"
        const contextId = replyContext.id || replyContext.getAttribute("id");
        const replyMsgId = contextId
          ? contextId.replace("message-reply-context-", "")
          : null;

        // Optional: get preview text
        const previewEl = replyContext.querySelector(
          '[class*="repliedTextPreview"], [class*="repliedTextContent"]'
        );
        const contentPreview = previewEl ? previewEl.textContent.trim() : null;

        if (replyAuthorName || replyMsgId) {
          replyTo = {
            authorName: replyAuthorName,
            messageId: replyMsgId,
            contentPreview,
          };
        }
      }

      return {
        channelId,
        messageId,
        author,
        content,
        timestamp,
        isReply: !!replyTo,
        replyTo, // null if not a reply
      };
    }, authorSpan);
  }

  async getAllMessages() {
    try {
      const container = await this.page.waitForSelector(
        'ol[data-list-id="chat-messages"], ul[data-list-id="chat-messages"], [role="log"]',
        { timeout: 15000 }
      );

      if (!container) {
        error("No message list container found");
        return [];
      }

      // Only get main author spans — NOT inside replies
      const authorSpans = await container.$$(
        'h3 span[class*="username"][role="button"]' // ← ONLY main headerauthorNames
      );

      // Fallback: if above fails (UI change), use broader but filter out replies
      if (authorSpans.length === 0) {
        log(
          "Primary selector failed, falling back to broader search with reply filtering"
        );
        const allSpans = await container.$$(
          'span[class*="username"][role="button"]'
        );
        const filtered = [];
        for (const span of allSpans) {
          const isInReply = await span.evaluate(
            (el) => !!el.closest('.repliedMessage, [class*="repliedMessage"]')
          );
          if (!isInReply) filtered.push(span);
        }
        authorSpans = filtered;
      }

      log(
        `Found ${authorSpans.length} valid author spans (replies filtered out)`
      );

      const messages = [];
      for (const span of authorSpans) {
        const data = await this.extractMessageData(span);
        if (data && data.messageId) {
          // Extra dedupe by messageId
          if (!this.messageCache.has(data.messageId)) {
            messages.push(data);
          }
        }
      }

      // Sort by timestamp or DOM order
      return messages.sort((a, b) => a.messageId.localeCompare(b.messageId));
    } catch (err) {
      error(`Error getting messages: ${err.message}`);
      return [];
    }
  }
  async getLatestMessage() {
    const messages = await this.getAllMessages();
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  async checkForNewMessages() {
    const messages = await this.getAllMessages();
    const newMessages = messages.filter(
      (msg) => !this.messageCache.has(msg.messageId)
    );

    if (newMessages.length > 0) {
      newMessages.forEach((msg) => {
        this.messageCache.add(msg.messageId);
        this.messageHandlers.forEach((handler) => {
          try {
            handler(msg);
          } catch (e) {
            error(`Error in message handler: ${e.message}`);
          }
        });
      });
      log(`Detected ${newMessages.length} new message(s)`);
    }
  }

  async startMonitoring(options = {}) {
    if (this.monitoring) {
      log("Already monitoring");
      return;
    }

    const { onStart = null } = options;
    this.monitoring = true;
    log("Starting real-time channel monitoring");

    const initialMessages = await this.getAllMessages();
    initialMessages.forEach((msg) => this.messageCache.add(msg.messageId));

    if (onStart) await onStart(initialMessages);

    await this.page.exposeFunction(
      "puppeteerOnPotentialNewMessage",
      async () => {
        // Small delay to let Discord fully render the new message
        setTimeout(async () => {
          await this.checkForNewMessages();
        }, 500);
      }
    );

    await this.page.evaluate(() => {
      // Find the container (same as getAllMessages)
      const scroller =
        document.querySelector('ol[data-list-id="chat-messages"]') ||
        document.querySelector('[role="log"]') ||
        document.querySelector('div[class*="scrollerInner"] ul') ||
        document.querySelector('div[class*="scrollerInner"]') ||
        document.querySelector('div[class*="messagesWrapper"]');

      if (!scroller) {
        console.error("Could not find scroller for observer");
        return;
      }

      const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;

        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            if (mutation.addedNodes.length > 0) {
              shouldCheck = true;
              break;
            }
          }
          // Also catch attribute changes (e.g., new IDs added)
          if (mutation.type === "attributes") {
            shouldCheck = true;
            break;
          }
        }

        if (shouldCheck) {
          window.puppeteerOnPotentialNewMessage();
        }
      });

      observer.observe(scroller, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["id", "class"], // Optional: limit attribute noise
      });

      window.discordMessageObserver = observer;
      console.log("Enhanced MutationObserver attached");
    });

    log("MutationObserver attached successfully (enhanced detection)");
  }

  stopMonitoring() {
    if (!this.monitoring) return;
    this.monitoring = false;

    this.page
      .evaluate(() => {
        if (window.discordMessageObserver) {
          window.discordMessageObserver.disconnect();
          delete window.discordMessageObserver;
        }
      })
      .catch(() => {});

    log("Monitoring stopped");
  }

  destroy() {
    this.stopMonitoring();
    this.messageHandlers = [];
    this.messageCache.clear();
    log("Channel monitor destroyed");
  }
}

module.exports = ChannelMonitorPlugin;
