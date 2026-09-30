const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pms', {
  isDesktop: true,
  version: ipcRenderer.sendSync('app:version'),
  load: () => ipcRenderer.sendSync('vault:load'),
  save: (payload) => ipcRenderer.invoke('vault:save', payload),
  saveSync: (payload) => ipcRenderer.sendSync('vault:save-sync', payload),
  git: (op) => ipcRenderer.sendSync('vault:git', op),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  applyUpdate: (assetUrl) => ipcRenderer.invoke('app:apply-update', assetUrl),
});
