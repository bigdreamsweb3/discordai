//  puppeteer\discord_plugins\index.js

const ClickPlugin = require("./click");
const WaitPlugin = require("./wait");
const LinkPlugin = require("./link");
const ChannelNavigation = require("./navigation/channels");
const ProfileOpener = require("./navigation/profile/openProfile");
const UserExtractor = require("./navigation/profile/extractUser");
const ChatPlugins = require("./chats");
const ChannelMonitorPlugin = require("./chats/channelMonitor");

class DiscordPlugins {
  constructor(page) {
    this.page = page;
    // this.ui = {
    //   click: new ClickPlugin(page),
    //   wait: new WaitPlugin(page),
    // };

    this.click = new ClickPlugin(page);

    this.wait = new WaitPlugin(page);

    this.navigation = {
      channels: new ChannelNavigation(page),
      servers: null,
      dms: null,
    };
    this.profile = {
      open: new ProfileOpener(page),
      extract: new UserExtractor(page),
    };

    this.chats = new ChatPlugins();

    this.monitor_chats = new ChannelMonitorPlugin();

    this.link = new LinkPlugin();
  }

  // Quick access methods
  // async findLastUsername(options = {}) {
  //   return await this.messages.findUsernames.findLastUsername(options);
  // }

  // async clickLastUsername(options = {}) {
  //   return await this.messages.findUsernames.clickLastUsername(options);
  // }
}

module.exports = DiscordPlugins;
