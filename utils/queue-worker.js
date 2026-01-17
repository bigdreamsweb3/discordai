const fs = require("fs");
const { randomUUID } = require("crypto");
const { log } = require("./logger");
const { baseDir } = require("./directories");
const path = require("path");

class QueueWorker {
  constructor(file = path.join(baseDir, "author_queue.json")) {
    this.file = file;
    this.queue = [];
    this.processing = false;
    this.seenUsers = new Set();
    this.isRunning = false;
    this.saveTimeout = null;

    this.currentPage = null;
    this.currentChannelId = null;

    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(this.file)) {
        if (!fs.existsSync(path.dirname(this.file)))
          fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify({ queue: [], seen: [] }));
      }
      const data = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      this.queue = (data.queue || []).map((t) => ({
        ...t,
        status: t.status === "processing" ? "pending" : t.status,
      }));
      (data.seen || []).forEach((u) => this.seenUsers.add(u));
      log(`📦 Queue loaded: ${this.queue.length} items.`);
    } catch (err) {
      log(`⚠️ Load error: ${err.message}`);
      this.queue = [];
    }
  }

  /**
   * Debounced save to prevent disk hammering during heavy traffic
   */
  saveToDisk() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      try {
        const data = { queue: this.queue, seen: Array.from(this.seenUsers) };
        fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
        this.saveTimeout = null;
      } catch (err) {
        log(`❌ Save error: ${err.message}`);
      }
    }, 500);
  }

  addAuthor(channelId, messageId, authorName, channelLink, replyInfo = null) {
    const cleanName = authorName?.trim();
    if (!cleanName || this.seenUsers.has(cleanName)) return;

    // Extract Server ID from Link
    const serverIdMatch = channelLink.match(/channels\/(\d+|@me)/);
    const serverId = serverIdMatch ? serverIdMatch[1] : "@me";

    this.queue.push({
      id: randomUUID(),
      serverId,
      channelId,
      messageId,
      authorName: cleanName,
      channelLink,
      status: "pending",
      addedAt: new Date().toISOString(),
      retryCount: 0,
    });

    this.seenUsers.add(cleanName);
    this.saveToDisk();
    log(`➕ Queued: ${cleanName}`);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    log("🚀 Queue Worker Active");
    this.processNext();
  }

  stop() {
    this.isRunning = false;
    if (this.currentPage) this.currentPage.close().catch(() => {});
    log("🛑 Queue Worker Stopped");
  }

  async processNext() {
    if (!this.isRunning || this.processing) return;

    const task = this.queue.find((t) => t.status === "pending");
    if (!task) {
      if (this.currentPage) {
        await this.currentPage.close().catch(() => {});
        this.currentPage = null;
        this.currentChannelId = null;
      }
      this.processing = false;
      return;
    }

    this.processing = true;
    task.status = "processing";
    this.saveToDisk();

    try {
      await this.handleTask(task);
      task.status = "done";
      task.completedAt = new Date().toISOString();

      // Success: Process next IMMEDIATELY for speed
      this.processing = false;
      this.processNext();
    } catch (err) {
      log(`❌ Task Error [${task.authorName}]: ${err.message}`);
      task.retryCount++;

      if (task.retryCount >= 5) {
        task.status = "failed";
        task.error = err.message;
      } else {
        task.status = "pending";
      }

      this.processing = false;
      // Error: Wait 3s before retrying to let Discord/Network stabilize
      setTimeout(() => this.processNext(), 3000);
    } finally {
      this.saveToDisk();
    }
  }

  async handleTask(task) {
    const { getPersistentBrowser } = require("../puppeteer/browser");
    const { extractUser } = require("../puppeteer/extractUser");

    const browser = getPersistentBrowser();
    if (!browser) throw new Error("Browser not available");

    // 1. Manage Page Instance
    if (!this.currentPage || this.currentPage.isClosed()) {
      this.currentPage = await browser.newPage();
      this.currentChannelId = null;
    }

    const page = this.currentPage;

    // 2. Execute Extraction
    // We pass serverId to help extractUser navigate smarter (ASAP method)
    const result = await extractUser(
      page,
      task.authorName,
      task.channelId,
      task.messageId,
      {
        serverId: task.serverId,
        takeScreenshot: false,
        closeProfileAfter: true,
      }
    );

    if (!result) throw new Error("Extraction returned no data");

    log(`✅ Extracted: ${result.displayName} (${result.userId || "No ID"})`);
    return result;
  }

  getStats() {
    return {
      pending: this.queue.filter((t) => t.status === "pending").length,
      done: this.queue.filter((t) => t.status === "done").length,
      failed: this.queue.filter((t) => t.status === "failed").length,
      total: this.queue.length,
    };
  }
}

module.exports = new QueueWorker();
