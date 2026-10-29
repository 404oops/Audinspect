// note: preload scripts run sandboxed, so only electron's own modules can be
// required here. the renderer imports the extension list through vite.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

function subscribe(channel, callback, mapArgs) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, ...args) =>
    callback(...(mapArgs ? mapArgs(...args) : args));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  // dialogs + files
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  readAudioFiles: (folderPath) => ipcRenderer.invoke("files:readAudio", folderPath),
  scanPaths: (paths) => ipcRenderer.invoke("files:scanPaths", paths),
  expandPaths: (paths) => ipcRenderer.invoke("files:expandPaths", paths),
  getFileMetadata: (paths) => ipcRenderer.invoke("files:getMetadata", paths),
  listFolder: (folderPath) => ipcRenderer.invoke("files:list", folderPath),
  traverseFolder: (folderPath) => ipcRenderer.invoke("files:traverse", folderPath),
  // real on-disk path of a File from a drag/drop event ("" when it has none)
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch (e) {
      return "";
    }
  },
  processFromBytes: (fileName, fileBytes) =>
    ipcRenderer.invoke("file:processFromBytes", fileName, fileBytes),
  watchFolder: (folderPath) => ipcRenderer.invoke("folder:watch", folderPath),
  unwatchFolder: () => ipcRenderer.invoke("folder:unwatch"),
  exportLegacyMetadata: () => ipcRenderer.invoke("metadata:exportLegacy"),
  deleteLegacyMetadata: () => ipcRenderer.invoke("metadata:deleteLegacy"),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),

  // files opened through the os (double-click / open with / argv)
  getPendingOpenFiles: () => ipcRenderer.invoke("files:getPendingOpen"),
  onOpenFiles: (callback) => subscribe("files:open", callback),

  // application menu
  onMenuOpenFolder: (callback) => subscribe("menu:openFolder", callback),
  onMenuOpenFiles: (callback) => subscribe("menu:openFiles", callback),
  onMenuOpenSettings: (callback) => subscribe("menu:openSettings", callback),

  // main-process settings (binary paths, cache limit)
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),

  // ffmpeg / ffprobe
  getBinariesStatus: () => ipcRenderer.invoke("binaries:status"),
  redetectBinaries: () => ipcRenderer.invoke("binaries:redetect"),
  getBinariesDownloadSize: () => ipcRenderer.invoke("binaries:downloadSize"),
  downloadBinaries: () => ipcRenderer.invoke("binaries:download"),
  removeDownloadedBinaries: () => ipcRenderer.invoke("binaries:removeDownloaded"),
  browseForBinary: (kind) => ipcRenderer.invoke("binaries:browse", kind),
  dismissBinariesPrompt: (dismissed) =>
    ipcRenderer.invoke("binaries:dismissPrompt", dismissed),
  onBinariesDownloadProgress: (callback) =>
    subscribe("binaries:downloadProgress", callback),

  // cache
  getCacheInfo: () => ipcRenderer.invoke("cache:info"),
  clearImportCache: () => ipcRenderer.invoke("cache:clearImports"),

  toFileUrl: (p) => {
    if (!p) return "";
    if (process.platform === "win32") {
      const forward = p.replace(/\\/g, "/");
      return `file:///${forward}`;
    }
    return `file://${p}`;
  },

  decodeToWav: (filePath) => ipcRenderer.invoke("file:decodeToWav", filePath),
  probeDuration: (filePath) => ipcRenderer.invoke("file:probeDuration", filePath),
  probeDurationsForFiles: (paths) => ipcRenderer.invoke("files:probeDurations", paths),
  onProbeDurationsProgress: (callback) =>
    subscribe("files:probeDurations:progress", callback),

  onFolderFilesDelta: (callback) => subscribe("folder:filesDelta", callback),
  onFilesMetadataDelta: (callback) => subscribe("files:metadataDelta", callback),
  onMediaPlayPause: (callback) => subscribe("media:playPause", () => callback()),
  onMediaNext: (callback) => subscribe("media:next", () => callback()),
  onMediaPrevious: (callback) => subscribe("media:previous", () => callback()),
  updatePlaybackState: (isPlaying) =>
    ipcRenderer.invoke("player:updatePlaybackState", !!isPlaying),

  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  showItemInFolder: (p) => ipcRenderer.invoke("shell:showItemInFolder", p),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),

  onFullscreenChange: (callback) => subscribe("window:fullscreen-change", callback),
});
