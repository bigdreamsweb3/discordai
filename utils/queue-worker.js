// utils/queue-worker.js

const fs = require("fs");
const { randomUUID } = require("crypto");
const { log } = require("./logger"); // Use your logger if available
const { navigateToChannel } = require("../puppeteer/navigate");

class QueueWorker {
  constructor(file = "data/author_queue.json") {
    this.file = file;
    this.queue = [];
    this.processing = false;
    this.seenUsers = new Set();
    this.isRunning = false; // ← Tracks if worker is actively processing

    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(this.file)) {
        fs.mkdirSync("data", { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify({ queue: [], seen: [] }));
      }

      const raw = fs.readFileSync(this.file, "utf-8");
      const data = JSON.parse(raw);

      this.queue = (data.queue || []).map((task) => {
        if (task.status === "processing") task.status = "pending"; // Reset stuck tasks
        return task;
      });

      (data.seen || []).forEach((u) => this.seenUsers.add(u));

      console.log(
        `Queue loaded: ${this.queue.length} tasks, ${this.seenUsers.size} unique users seen`
      );
    } catch (err) {
      console.error("Failed to load queue, starting fresh:", err.message);
      this.queue = [];
      this.seenUsers = new Set();
    }
  }

  saveToDisk() {
    try {
      const data = {
        queue: this.queue,
        seen: Array.from(this.seenUsers),
      };
      fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Failed to save queue:", err.message);
    }
  }

  addAuthor(channelId, messageId, authorName, channelLink, replyInfo = null) {
    const cleanAuthorName = authorName?.trim();
    if (!cleanAuthorName) return;

    if (this.seenUsers.has(cleanAuthorName)) {
      console.log(`Skipping duplicate user: ${cleanAuthorName}`);
      return;
    }

    const task = {
      id: randomUUID(),
      channelId,
      messageId,
      authorName: cleanAuthorName,
      channelLink,
      status: "pending",
      addedAt: new Date().toISOString(),
      replyInfo, // ← { username, messageId, contentPreview }
    };

    this.queue.push(task);
    this.seenUsers.add(cleanAuthorName);
    this.saveToDisk();

    const extra = replyInfo ? ` (reply to @${replyInfo.username})` : "";
    console.log(
      `Added to queue: ${cleanAuthorName}${extra} (messageId: ${messageId})`
    );
  }

  // This is the method you call manually to start processing
  start() {
    if (this.isRunning) {
      console.log("Queue worker is already running");
      return;
    }

    this.isRunning = true;
    console.log("Queue worker STARTED — now processing pending tasks");
    this.processNext(); // Kick off the loop
  }

  stop() {
    this.isRunning = false;
    console.log("Queue worker STOPPED");
  }

  async processNext() {
    // Stop if not supposed to be running
    if (!this.isRunning) {
      this.processing = false;
      return;
    }

    if (this.processing) return;

    const task = this.queue.find((t) => t.status === "pending");
    if (!task) {
      this.processing = false;
      // Still running, just idle
      return;
    }

    this.processing = true;
    task.status = "processing";
    task.startedAt = new Date().toISOString();
    this.saveToDisk();

    try {
      console.log(`Processing user: ${task.authorName}`);
      await this.handleTask(task);

      task.status = "done";
      task.completedAt = new Date().toISOString();
      console.log(`Done: ${task.authorName}`);
    } catch (err) {
      console.error(`Failed: ${task.authorName} | ${err.message}`);
      task.status = "pending";
      task.retryCount = (task.retryCount || 0) + 1;

      if (task.retryCount >= 5) {
        task.status = "failed";
        console.log(
          `Task permanently failed after 5 retries: ${task.authorName}`
        );
      }
    } finally {
      this.processing = false;
      this.saveToDisk();

      // Continue processing next task after delay
      if (this.isRunning) {
        setTimeout(() => this.processNext(), 3000); // 3 seconds between tasks
      }
    }
  }

  async handleTask(task) {
    const { authorName, channelLink, channelId, messageId } = task;

    console.log(`\nSTARTING PROFILE EXTRACTION TASK`);
    console.log(`   Target Author : ${authorName}`);
    console.log(`   Channel Link: ${channelLink}\n`);

    let extractionPage = null;

    try {
      const { getPersistentBrowser } = require("../puppeteer/browser");
      const { extractUser } = require("../puppeteer/extractUser");

      const browser = getPersistentBrowser();
      extractionPage = await browser.newPage();

      console.log("   New tab opened!");

      // Reuse existing session — no need to re-auth if persistent
      // await ensureAuthenticated(extractionPage); // Usually not needed with persistent session

      await navigateToChannel(extractionPage, channelLink);

      console.log(`   Extracting profile for "${authorName}"...`);
      const result = await extractUser(
        extractionPage,
        authorName,
        channelId,
        messageId,
        {
          takeScreenshot: true,
          closeProfileAfter: true,
        }
      );

      if (result) {
        console.log(`\nSUCCESS — Profile extracted!`);
        console.log(`   Name: ${result.displayName}`);
        console.log(`   User ID: ${result.userId || "Unknown"}`);
      } else {
        throw new Error("extractUser returned null/falsy");
      }
    } catch (error) {
      console.error(`\nERROR extracting ${authorName}: ${error.message}`);
      throw error;
    } finally {
      if (extractionPage) {
        await extractionPage.close().catch(() => {});
        console.log("   Tab closed\n");
      }
    }
  }

  // Optional: get current stats
  getStats() {
    const pending = this.queue.filter((t) => t.status === "pending").length;
    const done = this.queue.filter((t) => t.status === "done").length;
    const failed = this.queue.filter((t) => t.status === "failed").length;

    return { pending, done, failed, total: this.queue.length };
  }
}

// At the very bottom:
const queueWorker = new QueueWorker();
module.exports = queueWorker; // Export the instance, not the class
