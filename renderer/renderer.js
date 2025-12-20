const logsEl = document.getElementById("logs");
const addBtn = document.getElementById("addBtn");
const currentUrlEl = document.getElementById("currentUrl");

currentUrlEl.textContent = process.env.CHANNEL_URL || "From .env";

addBtn.onclick = () => {
  const serverId = document.getElementById("serverId").value.trim();
  const channelId = document.getElementById("channelId").value.trim();
  if (serverId && channelId) {
    window.electronAPI.addChannel({ serverId, channelId });
    document.getElementById("serverId").value = "";
    document.getElementById("channelId").value = "";
  }
};

window.electronAPI.sendLog((_event, data) => {
  const line = `[${new Date(data.timestamp).toLocaleTimeString()}] ${
    data.message
  }\n`;
  logsEl.textContent += line;
  logsEl.scrollTop = logsEl.scrollHeight;
});
