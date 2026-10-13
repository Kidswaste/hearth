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
  chrome: call('appwin:chrome'), // (round 30) open this app in Chrome (Google sign-in), the everyday Chrome, or back here
  onOffer: on('appwin:offer'),
  onDownloads: on('appwin:downloads'),
  onPaste: on('appwin:paste'),
  onNavigate: on('appwin:navigate'),
  onKey: on('appwin:key'),
  onCatalog: on('appwin:catalog'),
  // (round 31, chromeview) an app in Chrome shows here as a Chrome view: its frames, the owner's input, its page's events
  cview: {
    start: call('cview:start'), stop: call('cview:stop'), visible: call('cview:visible'), resize: call('cview:resize'), nav: call('cview:nav'),
    cursor: call('cview:cursor'), menu: call('cview:menu'), signIn: call('cview:signIn'), signedIn: call('cview:signedIn'),
    input: (id, list) => ipcRenderer.send('cview:input', id, list), ack: (id, ms) => ipcRenderer.send('cview:ack', id, ms),
    onFrame: on('cview:frame'), onEvent: on('cview:event'),
  },
});
