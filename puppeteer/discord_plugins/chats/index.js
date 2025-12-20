const ChannelMonitorPlugin = require("./channelMonitor");
const UsernameFinder = require("./findUsernames");
const LastAuthorPlugin = require("./lastAuthor");

// const SendMessage = require("./sendMessage"); // You can create this later
// const ExtractMessages = require("./extractMessages"); // You can create this later

class ChatPlugins {
  constructor(page) {
    this.page = page;

    this.channelMonitor = new ChannelMonitorPlugin(page);
    this.lastAuthor = new LastAuthorPlugin(page);
    this.findUsernames = new UsernameFinder(page);
    this.send = null;
    this.extract = null;
  }

  // Lazy load other plugins
  // async getSendPlugin() {
  //   if (!this.send) {
  //     this.send = new SendMessage(this.page);
  //   }
  //   return this.send;
  // }

  // async getExtractPlugin() {
  //   if (!this.extract) {
  //     this.extract = new ExtractMessages(this.page);
  //   }
  //   return this.extract;
  // }
}

module.exports = ChatPlugins;
