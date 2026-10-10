// Preload of an app window's chrome page (apps-window.html). The app's own website runs in a <webview> inside that
// page and gets nothing from here: only the chrome (back, reload, send to chat, downloads) talks to Hearth.
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, d) => cb(d));
contextBridge.exposeInMainWorld('appWin', {
  init: call('appwin:init'),
  state: call('appwin:state'),
  external: call('appwin:external'),
  toChat: call('appwin:toChat'),
  route: call('appwin:route'),
  action: call('appwin:action'),
  openApp: call('appwin:openApp'),
  reveal: call('appwin:reveal'),
  pasteResult: call('appwin:pasteResult'),
  signOut: call('appwin:signOut'),
  hide: call('appwin:hide'),
  onDownloads: on('appwin:downloads'),
  onPaste: on('appwin:paste'),
  onNavigate: on('appwin:navigate'),
  onKey: on('appwin:key'),
  onCatalog: on('appwin:catalog'),
});
