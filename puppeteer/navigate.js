const { log } = require("../utils/logger");

async function navigateToChannel(page, channelUrl) {
  try {
    // If already on Discord via persistent session, this may not be needed
    // But if URL changed, do it safely
    const currentUrl = page.url();
    if (!currentUrl.includes(channelUrl)) {
      await page.goto(channelUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      log(`Navigated to ${channelUrl}`);
      log(`Waiting...`);
    } else {
      log("Already on Discord Channel — skipping navigation");
    }
  } catch (err) {
    log(`Navigation failed (non-critical): ${err.message}`);
  }

  await new Promise((r) => setTimeout(r, 5000));

  // Your scroll logic...
  await page.evaluate(async () => {
    const scroller =
      document.querySelector('ol[data-list-id="chat-messages"]') ||
      document.querySelector("div.scrollerInner");
    if (scroller) {
      for (let i = 0; i < 25; i++) {
        scroller.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  });
}

module.exports = { navigateToChannel };
