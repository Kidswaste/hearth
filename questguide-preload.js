const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('questCompanion', {
  call: a => ipcRenderer.invoke('questguide:call', a),
  onChange: cb => { const h = (_e, value) => cb(value); ipcRenderer.on('questguide:changed', h); return () => ipcRenderer.removeListener('questguide:changed', h); },
  onError: cb => { const h = (_e, value) => cb(value); ipcRenderer.on('questguide:error', h); return () => ipcRenderer.removeListener('questguide:error', h); },
});
