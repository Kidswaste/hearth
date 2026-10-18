// The "You already have Hearth" card (round 64, twocopies64): what the card may ask the main side (twocopiesmain.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('twoCopies', {
  info: () => ipcRenderer.invoke('twocopies:info'),
  choose: (what, dir) => ipcRenderer.invoke('twocopies:choose', { what, dir }),
});
