// monitor.js

const ChannelMonitorPlugin = require("./puppeteer/discord_plugins/chats/channelMonitor");
const { extractUser } = require("./puppeteer/extractUser");

const userQueue = require("./utils/queue-worker");

async function startAdvancedMonitoring(page) {
  if (!page) {
    throw new Error("Page instance required");
  }

  // Get the EXACT current channel URL from the live page
  const channelLink = await page.url();
  console.log(`Monitoring channel: ${channelLink}`);

  const channelMonitor = new ChannelMonitorPlugin(page);

  await channelMonitor.startMonitoring({
    onStart: (initial) => {
      console.log(`Loaded ${initial.length} existing messages`);

      console.log(initial);

      initial.forEach((msg) => {
        if (msg.author) {
          userQueue.addAuthor(
            msg.channelId,
            msg.messageId,
            msg.author,
            channelLink
          );

          // extractUser(msg.author);
        }
      });
    },
  });

  channelMonitor.onNewMessage((message) => {
    console.log("\n🔔 NEW MESSAGE DETECTED 🔔");
    console.log(`👤 Author : ${message.author}`);
    console.log(`💬 Content: ${message.content}`);
    if (message.timestamp) {
      console.log(
        `🕐 Time   : ${new Date(message.timestamp).toLocaleString()}`
      );
    }
    console.log("───────────────────────────────────────────\n");

    // Pass the REAL monitored channel URL
    userQueue.addAuthor(
      message.channelId, // ← pass it
      message.messageId, // ← pass it
      message.author,
      channelLink
    );
  });

  console.log("Advanced monitoring + username queue active!");
  console.log(`All queued users will be processed using: ${channelLink}`);

  return {
    stop: async () => {
      channelMonitor.destroy();
      console.log("Monitoring stopped");
    },
  };
}

module.exports = { startAdvancedMonitoring };
