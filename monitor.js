const ChannelMonitorPlugin = require("./puppeteer/discord_plugins/chats/channelMonitor");
const userQueue = require("./utils/queue-worker");

async function startAdvancedMonitoring(page) {
  if (!page) throw new Error("Page instance required");

  // 1. Context Setup
  const currentUrl = await page.url();
  const serverId = currentUrl.split("/")[4]; // Extract server ID from URL
  console.log(`[Monitor] Tracking Server: ${serverId}`);

  const channelMonitor = new ChannelMonitorPlugin(page);

  // 2. Optimized Initial Message Processing
  const processMessages = (messages) => {
    if (!messages || messages.length === 0) return;

    // Use a local Set to avoid spamming the Queue Worker's internal logic
    const uniqueAuthorsInBatch = new Map();

    messages.forEach((msg) => {
      const name = msg.author?.trim();
      // Filter: Ignore empty names, bots (if detectable), or system messages
      if (!name || name === "Discord" || name === "System") return;

      // We keep the latest messageId for that author to ensure the bot jumps
      // to their most recent post for extraction
      uniqueAuthorsInBatch.set(name, msg);
    });

    uniqueAuthorsInBatch.forEach((msg, authorName) => {
      const jumpUrl = `https://discord.com/channels/${msg.channelId}/${msg.messageId}`;

      userQueue.addAuthor(
        msg.channelId,
        msg.messageId,
        authorName,
        jumpUrl,
        msg.replyInfo || null
      );
    });

    // Ensure the worker is running to handle the new items
    if (!userQueue.isRunning) userQueue.start();
  };

  try {
    await channelMonitor.startMonitoring({
      onStart: (initialMessages) => {
        console.log(
          `[Monitor] Found ${initialMessages.length} existing messages. Batching authors...`
        );
        processMessages(initialMessages);
      },
    });

    // 3. High-Speed Listener
    channelMonitor.onNewMessage((message) => {
      // Log only essential info to keep console clean
      console.log(
        `[New Msg] @${message.author}: ${message.content?.substring(0, 50)}...`
      );

      // Process single message through the same logic
      processMessages([message]);
    });

    console.log(`✅ Monitoring ACTIVE on ${currentUrl}`);
  } catch (err) {
    console.error(`[Monitor Error] Failed to start: ${err.message}`);
    throw err;
  }

  return {
    stop: async () => {
      channelMonitor.destroy();
      userQueue.stop();
      console.log("[Monitor] Service stopped.");
    },
  };
}

module.exports = { startAdvancedMonitoring };
