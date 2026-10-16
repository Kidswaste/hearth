// Preload for an HTML game's window (round 52, gameready): relays tools/gameready-page.js's messages to and from the
// hub through the main process. Nothing else of Hearth is exposed to the game.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__gameHost', { post: (msg) => ipcRenderer.send('gameready:from', msg) });
ipcRenderer.on('gameready:to', (_e, msg) => window.postMessage({ __gameready: true, ...msg }, '*'));
