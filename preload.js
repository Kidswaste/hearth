const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('hub', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  onConfigChanged: on('config:changed'),
  onShortcut: on('shortcut'),
  openFile: (which) => ipcRenderer.invoke('open-file', which),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  listChats: () => ipcRenderer.invoke('chats:list'),
  getChat: (id) => ipcRenderer.invoke('chats:get', id),
  saveChat: (chat) => ipcRenderer.invoke('chats:save', chat),
  deleteChat: (id) => ipcRenderer.invoke('chats:delete', id),
  getHistory: () => ipcRenderer.invoke('history:get'),
  saveHistory: (history) => ipcRenderer.invoke('history:save', history),

  send: (request) => ipcRenderer.invoke('engine:send', request),
  stop: (chatId) => ipcRenderer.invoke('engine:stop', chatId),
  login: (engine) => ipcRenderer.invoke('engine:login', engine),
  engineStatus: () => ipcRenderer.invoke('engine:status'),
  onEngineEvent: on('engine:event'),
});
