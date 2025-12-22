// preload.d.ts or any .d.ts file

interface ElectronAPI {
  // Incoming events from main process (listeners)
  onLogUpdate: (
    callback: (data: { timestamp: string; message: string }) => void
  ) => void;

  onChannelsUpdate: (callback: (urls: string[]) => void) => void;

  onCurrentTargetUpdate: (callback: (text: string) => void) => void;

  onMonitoringStatus: (callback: (active: boolean) => void) => void;

  // Outgoing commands to main process
  addChannel: (data: { serverId: string; channelId: string }) => void;
  removeChannel: (data: { url: string }) => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  startQueue: () => void;
  stopQueue: () => void;

  // Optional: if you provide removeListener
  removeLogListener?: () => void;
  // add more if needed
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
