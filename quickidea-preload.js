// 💡 Quick idea's small window (round 71, quickidea71): what it may ask the main side (quickideamain.js). Nothing else.
const { contextBridge, ipcRenderer } = require('electron');

const win = (a) => ipcRenderer.invoke('quickidea:win', a);
contextBridge.exposeInMainWorld('quickIdea', {
  info: () => win({ op: 'info' }),
  // { text, to: { dest, projectId? }, wav?: Uint8Array (16-bit PCM WAV made in this window), seconds? }
  save: (o) => win({ op: 'save', ...o }),
  hide: () => win({ op: 'hide' }),
  inbox: () => win({ op: 'inbox' }),
  onShown: (cb) => ipcRenderer.on('quickidea:shown', () => cb()),
});
