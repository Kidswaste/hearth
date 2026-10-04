const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfigChanged: (cb) => ipcRenderer.on('config:changed', (_e, data) => cb(data)),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, data) => cb(data)),
  openFile: (which) => ipcRenderer.invoke('open-file', which),
});
