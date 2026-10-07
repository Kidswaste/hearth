// Preload for the Stage window (the Lab's sketch in its own process): relays the sandbox's messages to and
// from the Lab through the main process. Nothing else of the hub is exposed here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__stageHost', {
  post: (msg) => ipcRenderer.send('stage:from', msg),
  fullscreen: () => ipcRenderer.send('stage:fullscreen'),
});
ipcRenderer.on('stage:to', (_e, msg) => window.postMessage(msg, '*'));
