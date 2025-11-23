const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// limited main-process functionality without exposing the entire ipcRenderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readAudioFiles: (folderPath) => ipcRenderer.invoke('files:readAudio', folderPath),
  listFolder: (folderPath) => ipcRenderer.invoke('files:list', folderPath),
  traverseFolder: (folderPath) => ipcRenderer.invoke('files:traverse', folderPath),
  // helper for converting paths to file URLs in renderer without using Node 'path'
  toFileUrl: (p) => {
    if (!p) return '';
    // On Windows, ensure the path uses forward slashes and has an extra leading slash
    if (process.platform === 'win32') {
      const forward = p.replace(/\\/g, '/');
      return `file:///${forward}`;
    }
    return `file://${p}`;
  },
  // read a file as raw bytes (Buffer) from the main process
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  // decode via ffmpeg on the main process and return WAV bytes (requires ffmpeg installed)
  decodeToWav: (filePath) => ipcRenderer.invoke('file:decodeToWav', filePath),
  // Register a listener for files loaded via the application menu
  onFilesLoaded: (callback) => {
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('files:loaded', listener);
    return () => ipcRenderer.removeListener('files:loaded', listener);
  },
});
