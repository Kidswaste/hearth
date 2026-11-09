// (Nov 9, labplayer) Preload for the Lab player's window: relays the preview page's messages to and from the Lab
// through the player's main process and Hearth's (labplayermain.js), as stage-preload.js does for the Stage window.
// `player: true` tells the page it is the Lab preview (gestures, Lite mode, as in Hearth's own frame), not the Stage.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__stageHost', {
  player: true,
  post: (msg) => ipcRenderer.send('lp:from', msg),
  fullscreen: () => {},
});
ipcRenderer.on('lp:to', (_e, msg) => window.postMessage(msg, '*'));
