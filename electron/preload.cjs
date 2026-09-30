const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pms', {
  isDesktop: true,
  load: () => ipcRenderer.sendSync('vault:load'),
  save: (payload) => ipcRenderer.sendSync('vault:save', payload),
  git: (op) => ipcRenderer.sendSync('vault:git', op),
});
