// renderer/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// renderer/preload.js
contextBridge.exposeInMainWorld("electronAPI", {
  onLogUpdate: (callback) =>
    ipcRenderer.on("log-update", (_e, data) => callback(data)),
  onChannelsUpdate: (callback) =>
    ipcRenderer.on("channels-update", (_e, urls) => callback(urls)),
  onCurrentTargetUpdate: (callback) =>
    ipcRenderer.on("current-target-update", (_e, text) => callback(text)),
  onMonitoringStatus: (callback) =>
    ipcRenderer.on("monitoring-status", (_e, active) => callback(active)),

  addChannel: (data) => ipcRenderer.send("add-channel", data),
  removeChannel: (data) => ipcRenderer.send("remove-channel", data),
  startMonitoring: () => ipcRenderer.send("start-monitoring"),
  stopMonitoring: () => ipcRenderer.send("stop-monitoring"),
});
