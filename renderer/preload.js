const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  sendLog: (callback) => ipcRenderer.on("log-update", callback),
  addChannel: (data) => ipcRenderer.send("add-channel", data),
});
