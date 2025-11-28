const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  readAudioFiles: (folderPath) => ipcRenderer.invoke('files:readAudio', folderPath),
  scanPaths: (paths) => ipcRenderer.invoke('files:scanPaths', paths),
  getFileMetadata: (paths) => ipcRenderer.invoke('files:getMetadata', paths),
  listFolder: (folderPath) => ipcRenderer.invoke('files:list', folderPath),
  traverseFolder: (folderPath) => ipcRenderer.invoke('files:traverse', folderPath),
  getFilePath: (fileRef) => ipcRenderer.invoke('file:getPath', fileRef),
  processFromBytes: (fileName, fileBytes) => ipcRenderer.invoke('file:processFromBytes', fileName, fileBytes),
  watchFolder: (folderPath) => ipcRenderer.invoke('folder:watch', folderPath),
  unwatchFolder: () => ipcRenderer.invoke('folder:unwatch'),


  toFileUrl: (p) => {
    if (!p) return '';

    if (process.platform === 'win32') {
      const forward = p.replace(/\\/g, '/');
      return `file:///${forward}`;
    }
    return `file://${p}`;
  },

  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  decodeToWav: (filePath) => ipcRenderer.invoke('file:decodeToWav', filePath),
  probeDuration: (filePath) => ipcRenderer.invoke('file:probeDuration', filePath),
  probeDurationsForFiles: (paths) => ipcRenderer.invoke('files:probeDurations', paths),
  onProbeDurationsProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('files:probeDurations:progress', listener);
    return () => ipcRenderer.removeListener('files:probeDurations:progress', listener);
  },

  onFilesLoaded: (callback) => {
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('files:loaded', listener);
    return () => ipcRenderer.removeListener('files:loaded', listener);
  },
  onFolderFilesDelta: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('folder:filesDelta', listener);
    return () => ipcRenderer.removeListener('folder:filesDelta', listener);
  },
  onFilesMetadataDelta: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, items) => callback(items);
    ipcRenderer.on('files:metadataDelta', listener);
    return () => ipcRenderer.removeListener('files:metadataDelta', listener);
  },
  onMediaPlayPause: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('media:playPause', listener);
    return () => ipcRenderer.removeListener('media:playPause', listener);
  },
  onMediaNext: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('media:next', listener);
    return () => ipcRenderer.removeListener('media:next', listener);
  },
  onMediaPrevious: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('media:previous', listener);
    return () => ipcRenderer.removeListener('media:previous', listener);
  },
  updatePlaybackState: (isPlaying) => ipcRenderer.invoke('player:updatePlaybackState', !!isPlaying),

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('window:fullscreen-change', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-change', listener);
  },
});

