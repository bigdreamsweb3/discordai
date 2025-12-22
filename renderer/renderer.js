// renderer/renderer.js

if (!window.electronAPI) {
  document.body.innerHTML = `
    <div style="padding:20px;font-family:monospace;color:#ef4444">
      FATAL: electronAPI not found.<br/>
      Preload failed or path incorrect.
    </div>
  `;
  throw new Error("electronAPI missing");
}

const logsEl = document.getElementById("logs");
const currentUrlEl = document.getElementById("currentUrl");
const channelsListEl = document.getElementById("channelsList");
const channelCountEls = [
  document.getElementById("channelCount"),
  document.getElementById("activeChannels"),
];
const eventCountEls = [
  document.getElementById("eventCount"),
  document.getElementById("totalEvents"),
];
const addBtn = document.getElementById("addBtn");
const serverIdInput = document.getElementById("serverId");
const channelIdInput = document.getElementById("channelId");
const timestampEl = document.getElementById("timestamp");
const uptimeEl = document.getElementById("uptime");
const statsUptimeEl = document.getElementById("statsUptime");

let startTime = Date.now();
let eventCount = 0;
let channels = []; // Will be populated from main process

// Real-time clock & uptime
setInterval(() => {
  const now = new Date();
  timestampEl.textContent = now.toTimeString().split(" ")[0];

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  const timeStr = `${h}:${m}:${s}`;
  uptimeEl.textContent = `UPTIME: ${timeStr}`;
  statsUptimeEl.textContent = timeStr;
}, 1000);

// Add log with color and animation
function addLog(message, type = "info") {
  const timestamp = new Date().toTimeString().split(" ")[0];
  const prefix =
    type === "success" ? "[SUCCESS]" : type === "error" ? "[ERROR]" : "[INFO]";
  const color =
    type === "success"
      ? "text-[#3ba55d]"
      : type === "error"
      ? "text-red-400"
      : "text-[#b9bbbe]";

  const entry = document.createElement("div");
  entry.className = `log-entry ${color}`;
  entry.textContent = `${timestamp} ${prefix} ${message}`;
  logsEl.appendChild(entry);
  logsEl.scrollTop = logsEl.scrollHeight;

  eventCount++;
  eventCountEls.forEach((el) => (el.textContent = eventCount));
}

// Render channels list
function renderChannels() {
  if (channels.length === 0) {
    channelsListEl.innerHTML =
      '<p class="text-xs mono text-gray-600 text-center py-4">No channels configured</p>';
    return;
  }

  channelsListEl.innerHTML = channels
    .map(
      (ch, index) => `
    <div class="channel-item bg-[#0f0f0f] border border-[#2a2a2a] rounded p-3 flex items-center justify-between">
      <div class="flex-1 min-w-0">
        <p class="text-xs mono text-gray-400 mb-1">Channel ${index + 1}</p>
        <p class="text-xs mono text-[#5865f2] truncate">${ch.url}</p>
      </div>
      <button onclick="window.removeChannel(${index})" class="remove-btn text-red-500 hover:text-red-300 hover:bg-red-500/20 px-2 py-1 rounded text-xs mono">
        REMOVE
      </button>
    </div>
  `
    )
    .join("");
}

// Remove channel (sent to main process)
window.removeChannel = function (index) {
  const channel = channels[index];
  channels.splice(index, 1);
  renderChannels();
  updateChannelCount();

  addLog(`Remove request sent: ${channel.url}`, "info");
  window.electronAPI.removeChannel({
    serverId: channel.serverId,
    channelId: channel.channelId,
    url: channel.url,
  });
};

// Update all channel counters
function updateChannelCount() {
  const count = channels.length;
  channelCountEls.forEach((el) => (el.textContent = count));
}

// Initial boot logs
addLog("System initialized", "success");
addLog("Connecting to background process...", "info");

// Safety check for electronAPI
if (!window.electronAPI) {
  addLog("FATAL: electronAPI not available! Check preload.js", "error");
}

// Receive full channel list from main process at startup or after changes
window.electronAPI.onChannelsUpdate((urls) => {
  channels = urls.map((url) => {
    const parts = url.match(/https:\/\/discord\.com\/channels\/(\d+)\/(\d+)/);
    if (parts) {
      return {
        serverId: parts[1],
        channelId: parts[2],
        url,
      };
    }
    return { url }; // fallback
  });

  renderChannels();
  updateChannelCount();

  // Update CURRENT_TARGET based on number of channels
  if (urls.length === 1) {
    currentUrlEl.textContent = urls[0];
  } else if (urls.length > 1) {
    currentUrlEl.textContent = `${urls.length} channels active`;
  } else {
    currentUrlEl.textContent = "No channels active";
  }
});

// Optional: direct update for current target (useful for single-channel focus)
window.electronAPI.onCurrentTargetUpdate((text) => {
  currentUrlEl.textContent = text;
});

// Listen for real-time logs from main process
window.electronAPI.onLogUpdate((data) => {
  let type = "info";
  if (
    data.message.includes("ACTIVE") ||
    data.message.includes("Authentication") ||
    data.message.includes("success")
  ) {
    type = "success";
  }
  if (
    data.message.includes("ERROR") ||
    data.message.includes("Failed") ||
    data.message.includes("FATAL")
  ) {
    type = "error";
  }

  addLog(data.message, type);
});

// Add channel button – optimistic UI + send to main
addBtn.onclick = () => {
  const serverId = serverIdInput.value.trim();
  const channelId = channelIdInput.value.trim();

  if (!serverId || !channelId) {
    addLog("Invalid input: Both Server ID and Channel ID required", "error");
    return;
  }

  const url = `https://discord.com/channels/${serverId}/${channelId}`;

  // Optimistic update (will be confirmed/updated by main process later)
  const newChannel = { serverId, channelId, url };
  channels.push(newChannel);
  renderChannels();
  updateChannelCount();
  currentUrlEl.textContent = url;

  addLog(`Adding new channel: ${url}`, "success");

  // Send request to main process
  window.electronAPI.addChannel({ serverId, channelId });

  // Clear inputs
  serverIdInput.value = "";
  channelIdInput.value = "";
};

// Add these elements
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const monitorStatus = document.getElementById("monitorStatus");
const bottomStatus = document.getElementById("bottomStatus");
const pulseDot = document.getElementById("pulseDot");
const pulseText = document.getElementById("pulseText");

const startBtn = document.getElementById("startMonitoringBtn");
const stopBtn = document.getElementById("stopMonitoringBtn");

let isMonitoring = false;

// Function to update all status indicators
function updateMonitoringStatus(active) {
  isMonitoring = active;

  const color = active ? "#3ba55d" : "rgb(239 68 68)"; // green : red-500
  const dotColor = active ? "#3ba55d" : "#ef4444";
  const status = active ? "ACTIVE" : "STOPPED";
  const system = active ? "SYSTEM_ONLINE" : "SYSTEM_OFFLINE";
  const pulse = active ? "MONITORING" : "IDLE";

  // Update all elements
  statusDot.style.backgroundColor = dotColor;
  statusText.textContent = system;
  statusText.style.color = color;
  monitorStatus.textContent = status;
  monitorStatus.style.color = color;
  bottomStatus.textContent = status;
  bottomStatus.style.color = color;
  pulseDot.style.backgroundColor = dotColor;
  pulseText.textContent = pulse;
  pulseText.style.color = color;

  // Pulse animation
  if (active) {
    pulseDot.classList.add("pulse");
  } else {
    pulseDot.classList.remove("pulse");
  }

  // Button states
  startBtn.disabled = active;
  stopBtn.disabled = !active;
  startBtn.classList.toggle("opacity-50", active);
  stopBtn.classList.toggle("opacity-50", !active);
}

// Initial state
updateMonitoringStatus(false);

// Button clicks
startBtn.onclick = () => {
  window.electronAPI.startMonitoring();
  addLog("Starting monitoring...", "info");
};

stopBtn.onclick = () => {
  window.electronAPI.stopMonitoring();
  addLog("Stopping monitoring...", "info");
};

// Listen for status updates from main process
window.electronAPI.onMonitoringStatus((active) => {
  updateMonitoringStatus(active);
  addLog(
    active ? "Monitoring started successfully" : "Monitoring stopped",
    active ? "success" : "info"
  );
});
