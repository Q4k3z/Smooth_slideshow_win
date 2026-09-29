const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  scanDroppedFolder: (file) => {
    const filePath = webUtils.getPathForFile(file);
    return filePath ? ipcRenderer.invoke('scan:droppedFolder', filePath) : Promise.resolve(null);
  },
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onFullscreenChange: (callback) => {
    const listener = (_event, isFull) => callback(isFull);
    ipcRenderer.on('window:fullscreen-state', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-state', listener);
  },
  onScanProgress: (callback) => {
    const listener = (_event, count) => callback(count);
    ipcRenderer.on('scan:progress', listener);
    return () => ipcRenderer.removeListener('scan:progress', listener);
  }
});
