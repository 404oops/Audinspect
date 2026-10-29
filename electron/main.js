const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  globalShortcut,
  nativeImage,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const chokidar = require("chokidar");
const ffmpeg = require("./ffmpeg-downloader");
const cache = require("./cache-manager");
const settingsStore = require("./settings-store");
const {
  AUDIO_EXTENSIONS,
  AUDIO_EXTENSION_LIST,
  isAudioPath,
} = require("./audio-extensions");

// ---------------------------------------------------------------------------
// single instance + files opened via the os (double-click / "open with" /
// command line). paths are queued until the renderer asks for them.
// ---------------------------------------------------------------------------
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let pendingOpenPaths = [];
let rendererAcceptsOpens = null; // webContents that called files:getPendingOpen

function queueOpenPaths(paths) {
  const list = (paths || []).filter((p) => typeof p === "string" && p.trim());
  if (!list.length) return;
  if (rendererAcceptsOpens && !rendererAcceptsOpens.isDestroyed()) {
    try {
      rendererAcceptsOpens.send("files:open", list);
      return;
    } catch (e) {}
  }
  pendingOpenPaths.push(...list);
}

// argv contains the electron binary, (in dev) the app dir, and any flags;
// keep only existing audio files / folders
function extractOpenPathsFromArgv(argv, cwd) {
  const out = [];
  for (const raw of (argv || []).slice(1)) {
    if (!raw || raw.startsWith("-")) continue;
    const p = path.isAbsolute(raw) ? raw : path.resolve(cwd || process.cwd(), raw);
    try {
      const st = require("fs").statSync(p);
      if (st.isFile() && isAudioPath(p)) out.push(p);
      else if (st.isDirectory() && app.isPackaged) out.push(p);
    } catch (e) {}
  }
  return out;
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  queueOpenPaths([filePath]);
  focusMainWindow();
});

app.on("second-instance", (_event, argv, workingDirectory) => {
  queueOpenPaths(extractOpenPathsFromArgv(argv, workingDirectory));
  focusMainWindow();
});

function focusMainWindow() {
  const win = BrowserWindow.getAllWindows().find((w) => w && !w.isDestroyed());
  if (!win) return;
  try {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// folder watching
// ---------------------------------------------------------------------------
let folderWatcher = null;
let folderWatcherPath = null;
let folderWatcherWebContents = null;
let folderDeltaAdded = new Set();
let folderDeltaRemoved = new Set();
let folderDeltaTimeout = null;
let metadataPendingPaths = new Set();
let metadataTimeout = null;

function stopFolderWatcher() {
  if (folderWatcher) {
    try {
      folderWatcher.close();
    } catch (e) {}
    folderWatcher = null;
  }
  folderWatcherPath = null;
  folderWatcherWebContents = null;
  folderDeltaAdded = new Set();
  folderDeltaRemoved = new Set();
  if (folderDeltaTimeout) {
    clearTimeout(folderDeltaTimeout);
    folderDeltaTimeout = null;
  }
  metadataPendingPaths = new Set();
  if (metadataTimeout) {
    clearTimeout(metadataTimeout);
    metadataTimeout = null;
  }
}

// runs fn over items with at most `limit` in flight, preserving result order
function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await fn(items[i], i);
    return run();
  };
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    run
  );
  return Promise.all(workers).then(() => results);
}

function scheduleFolderDeltaFlush() {
  if (!folderWatcherWebContents) return;
  if (folderDeltaTimeout) return;
  folderDeltaTimeout = setTimeout(() => {
    folderDeltaTimeout = null;
    const added = Array.from(folderDeltaAdded);
    const removed = Array.from(folderDeltaRemoved);
    folderDeltaAdded = new Set();
    folderDeltaRemoved = new Set();
    if (!folderWatcherWebContents) return;
    if (!added.length && !removed.length) return;
    try {
      folderWatcherWebContents.send("folder:filesDelta", {
        folderPath: folderWatcherPath,
        added,
        removed,
      });
    } catch (e) {
      console.warn("Failed to send folder:filesDelta:", e);
    }
  }, 200);
}

async function statMetadata(p) {
  const st = await fs.stat(p);
  const ext = path.extname(p).toLowerCase();
  return {
    path: p,
    size: typeof st.size === "number" ? st.size : null,
    mtimeMs: typeof st.mtimeMs === "number" ? st.mtimeMs : null,
    mtimeIso: st.mtime.toISOString(),
    type: ext || null,
  };
}

function scheduleMetadataFlush() {
  if (!folderWatcherWebContents) return;
  if (metadataTimeout) return;
  metadataTimeout = setTimeout(async () => {
    const paths = Array.from(metadataPendingPaths);
    metadataPendingPaths = new Set();
    metadataTimeout = null;
    if (!folderWatcherWebContents) return;
    if (!paths.length) return;
    const items = (
      await Promise.all(paths.map((p) => statMetadata(p).catch(() => null)))
    ).filter(Boolean);
    if (!items.length) return;
    if (!folderWatcherWebContents) return;
    try {
      folderWatcherWebContents.send("files:metadataDelta", items);
    } catch (e) {
      console.warn("Failed to send files:metadataDelta:", e);
    }
  }, 300);
}

async function collectAudioFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const parts = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // an unreadable subfolder shouldn't hide the rest of the tree
        return collectAudioFiles(fullPath).catch(() => []);
      }
      if (entry.isFile() && isAudioPath(entry.name)) return [fullPath];
      return [];
    })
  );
  return parts.flat();
}

// ---------------------------------------------------------------------------
// legacy leveldb metadata export (migrated into indexeddb by the renderer)
// ---------------------------------------------------------------------------
let legacyMetadataDb = null;

function getLegacyMetadataDb() {
  if (legacyMetadataDb) return legacyMetadataDb;
  // native module, only needed for the one-time leveldb -> indexeddb
  // migration; required lazily so a missing prebuild can't take the app down
  const { Level } = require("level");
  const userDataDir = app.getPath("userData");
  const dbPath = path.join(userDataDir, "audinspect-metadata");
  legacyMetadataDb = new Level(dbPath, { valueEncoding: "json" });
  return legacyMetadataDb;
}

async function exportLegacyMetadataRecords() {
  let db;
  try {
    db = getLegacyMetadataDb();
  } catch (e) {
    return [];
  }

  const records = [];
  try {
    const entries = await db.iterator().all();
    for (const [key, value] of entries) {
      if (!value || typeof value !== "object") continue;
      const size =
        typeof value.size === "number" && Number.isFinite(value.size)
          ? value.size
          : null;
      const mtimeMs =
        typeof value.mtimeMs === "number" && Number.isFinite(value.mtimeMs)
          ? value.mtimeMs
          : null;
      const duration =
        typeof value.duration === "number" &&
        Number.isFinite(value.duration) &&
        value.duration > 0
          ? value.duration
          : null;
      records.push({
        path: key,
        size,
        mtimeMs,
        mtimeIso:
          typeof value.mtimeIso === "string" && value.mtimeIso
            ? value.mtimeIso
            : null,
        type:
          typeof value.type === "string" && value.type ? value.type : null,
        duration,
        createdAt:
          typeof value.createdAt === "number" &&
          Number.isFinite(value.createdAt)
            ? value.createdAt
            : null,
        updatedAt:
          typeof value.updatedAt === "number" &&
          Number.isFinite(value.updatedAt)
            ? value.updatedAt
            : null,
      });
    }
  } catch (e) {
    console.warn("failed to export legacy metadata records:", e);
  }

  try {
    if (db && typeof db.close === "function") {
      await db.close();
    }
  } catch (e) {}
  legacyMetadataDb = null;

  return records;
}

// ---------------------------------------------------------------------------
// window
// ---------------------------------------------------------------------------
function createWindow() {
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    // on macos, use hiddenInset to get native traffic light buttons
    ...(isMac && {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 7 },
    }),
    icon: path.join(__dirname, "../resources/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // track fullscreen state for macOS traffic light spacer
  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("window:fullscreen-change", true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("window:fullscreen-change", false);
  });

  return mainWindow;
}

// ---------------------------------------------------------------------------
// dialogs + file system
// ---------------------------------------------------------------------------
ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled) return null;
  return result.filePaths[0] || null;
});

ipcMain.handle("dialog:openFiles", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Audio Files", extensions: AUDIO_EXTENSION_LIST },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0)
    return [];
  return result.filePaths;
});

ipcMain.handle("files:readAudio", async (_event, folderPath) => {
  if (!folderPath) return [];
  try {
    const files = await collectAudioFiles(folderPath);
    return files;
  } catch (err) {
    console.error("Error reading audio files:", err);
    return [];
  }
});

ipcMain.handle("folder:watch", async (event, folderPath) => {
  if (!folderPath || typeof folderPath !== "string") {
    stopFolderWatcher();
    return null;
  }
  try {
    const st = await fs.stat(folderPath);
    if (!st.isDirectory()) {
      return null;
    }
  } catch (e) {
    console.warn("folder:watch stat failed:", e);
    return null;
  }
  if (
    folderWatcher &&
    folderWatcherPath === folderPath &&
    folderWatcherWebContents === event.sender
  ) {
    return null;
  }
  stopFolderWatcher();
  folderWatcherWebContents = event.sender;
  folderWatcherPath = folderPath;
  folderWatcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,
    depth: Infinity,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });
  const handleAdd = (p) => {
    if (!isAudioPath(p)) return;
    folderDeltaAdded.add(p);
    folderDeltaRemoved.delete(p);
    scheduleFolderDeltaFlush();
    metadataPendingPaths.add(p);
    scheduleMetadataFlush();
  };
  const handleUnlink = (p) => {
    if (!isAudioPath(p)) return;
    folderDeltaRemoved.add(p);
    folderDeltaAdded.delete(p);
    scheduleFolderDeltaFlush();
  };
  const handleChange = (p) => {
    if (!isAudioPath(p)) return;
    metadataPendingPaths.add(p);
    scheduleMetadataFlush();
  };
  folderWatcher.on("add", handleAdd);
  folderWatcher.on("unlink", handleUnlink);
  folderWatcher.on("change", handleChange);
  folderWatcher.on("error", (err) => {
    console.error("folder watcher error:", err);
  });
  return null;
});

ipcMain.handle("folder:unwatch", async () => {
  stopFolderWatcher();
  return null;
});

// fallback for dropped files that have no path on disk (e.g. dragged out of
// a browser). the bytes are copied into the capped imports cache.
ipcMain.handle("file:processFromBytes", async (_event, fileName, fileBytes) => {
  try {
    if (!isAudioPath(fileName)) {
      return { path: null, error: "unsupported file type" };
    }
    return await cache.writeImport(fileName, fileBytes);
  } catch (err) {
    console.error("Failed to process file from bytes:", err);
    return { path: null, error: err.message };
  }
});

// expands a mix of file and folder paths into the audio files they contain.
// `unsupported` counts the top-level files that were skipped.
ipcMain.handle("files:expandPaths", async (_event, paths) => {
  const input = Array.isArray(paths)
    ? paths.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim())
    : [];
  const results = await Promise.all(
    input.map(async (p) => {
      try {
        const st = await fs.stat(p);
        if (st.isDirectory()) {
          return { files: await collectAudioFiles(p), folder: true };
        }
        if (st.isFile()) {
          return isAudioPath(p) ? { files: [p] } : { unsupported: true };
        }
        return {};
      } catch (e) {
        console.warn(`Failed to stat path ${p}:`, e);
        return { unsupported: true };
      }
    })
  );
  const files = [];
  let unsupported = 0;
  let folders = 0;
  results.forEach((r) => {
    if (r.files) files.push(...r.files);
    if (r.unsupported) unsupported += 1;
    if (r.folder) folders += 1;
  });
  return { files: [...new Set(files)], unsupported, folders };
});

ipcMain.handle("files:scanPaths", async (_event, paths) => {
  if (!paths || !Array.isArray(paths)) return [];
  const normalizedPaths = paths
    .filter((raw) => typeof raw === "string" && raw.trim())
    .map((p) => p.trim());
  if (!normalizedPaths.length) return [];

  const parts = await Promise.all(
    normalizedPaths.map(async (p) => {
      try {
        const st = await fs.stat(p);
        if (st.isDirectory()) return collectAudioFiles(p);
        return st.isFile() && isAudioPath(p) ? [p] : [];
      } catch (e) {
        console.warn(`Failed to stat path ${p}:`, e);
        return [];
      }
    })
  );
  return [...new Set(parts.flat())];
});

ipcMain.handle("files:getMetadata", async (_event, paths) => {
  if (!paths || !Array.isArray(paths)) return [];
  const uniquePaths = [
    ...new Set(paths.filter((p) => typeof p === "string" && p.trim())),
  ];
  if (!uniquePaths.length) return [];

  return Promise.all(
    uniquePaths.map((p) =>
      statMetadata(p).catch((e) => {
        console.warn("Failed to stat for metadata:", p, e);
        return { path: p };
      })
    )
  );
});

ipcMain.handle("files:list", async (_event, folderPath) => {
  if (!folderPath) return [];
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: path.join(folderPath, e.name),
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  } catch (err) {
    console.error("Error listing folder:", err);
    return [];
  }
});

ipcMain.handle("metadata:exportLegacy", async () => {
  try {
    const records = await exportLegacyMetadataRecords();
    return { records };
  } catch (e) {
    console.warn("metadata:exportLegacy failed:", e);
    return { records: [] };
  }
});

ipcMain.handle("metadata:deleteLegacy", async () => {
  try {
    if (legacyMetadataDb && typeof legacyMetadataDb.close === "function") {
      await legacyMetadataDb.close();
    }
  } catch (e) {}
  legacyMetadataDb = null;

  try {
    const userDataDir = app.getPath("userData");
    const dbPath = path.join(userDataDir, "audinspect-metadata");
    await fs.rm(dbPath, { recursive: true, force: true });
  } catch (e) {}

  return null;
});

ipcMain.handle("files:traverse", async (_event, folderPath) => {
  if (!folderPath) return null;
  async function build(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: fullPath,
            type: "directory",
            children: await build(fullPath),
          };
        }
        if (!entry.isFile()) return null;
        try {
          const st = await fs.stat(fullPath);
          return { name: entry.name, path: fullPath, type: "file", size: st.size };
        } catch (e) {
          return { name: entry.name, path: fullPath, type: "file" };
        }
      })
    );
    return nodes.filter(Boolean);
  }

  try {
    const tree = await build(folderPath);
    return tree;
  } catch (err) {
    console.error("Error traversing folder:", err);
    return null;
  }
});

ipcMain.handle("file:read", async (_event, filePath) => {
  if (!filePath) return null;
  try {
    const data = await fs.readFile(filePath);
    return data;
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
});

// files handed to us by the os (double-click, "open with", argv)
ipcMain.handle("files:getPendingOpen", (event) => {
  rendererAcceptsOpens = event.sender;
  const list = pendingOpenPaths;
  pendingOpenPaths = [];
  return list;
});

// ---------------------------------------------------------------------------
// window controls / shell
// ---------------------------------------------------------------------------
ipcMain.handle("window:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle("shell:openExternal", async (_event, url) => {
  if (
    !url ||
    typeof url !== "string" ||
    !/^https?:\/\//i.test(url)
  ) {
    return;
  }
  await shell.openExternal(url);
});

ipcMain.handle("shell:showItemInFolder", async (_event, p) => {
  if (!p || typeof p !== "string") return;
  shell.showItemInFolder(p);
});

ipcMain.handle("app:getVersion", () => app.getVersion());

// ---------------------------------------------------------------------------
// settings (main-process side: binary paths, cache limit)
// ---------------------------------------------------------------------------
ipcMain.handle("settings:get", () => settingsStore.getSettings());

ipcMain.handle("settings:set", async (_event, partial) => {
  const before = settingsStore.getSettings();
  const next = settingsStore.setSettings(partial);
  if (
    before.ffmpegPath !== next.ffmpegPath ||
    before.ffprobePath !== next.ffprobePath
  ) {
    await ffmpeg.resolveBinaries({ force: true });
  }
  if (before.maxCacheMB !== next.maxCacheMB) {
    await cache.enforceLimit();
  }
  return next;
});

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe
// ---------------------------------------------------------------------------
ipcMain.handle("file:decodeToWav", async (_event, filePath) => {
  if (!filePath) return null;

  const ffmpegPath = await ffmpeg.getFfmpegPath();
  if (!ffmpegPath) {
    return {
      data: null,
      error: "ffmpeg is not available. set it up in settings > audio.",
      code: null,
      needsDownload: true,
    };
  }

  const startedAt = Date.now();
  return new Promise((resolve) => {
    try {
      const args = ["-hide_banner", "-nostdin", "-i", filePath, "-f", "wav", "-"];
      const ff = spawn(ffmpegPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const chunks = [];
      ff.stdout.on("data", (c) => chunks.push(c));
      let errBuf = "";
      ff.stderr.on("data", (d) => {
        if (errBuf.length < 65536) errBuf += d.toString();
      });

      ff.on("close", (code) => {
        if (code === 0) {
          const out = Buffer.concat(chunks);
          console.log(
            `ffmpeg decoded ${path.basename(filePath)} (${(out.length / 1024 / 1024).toFixed(1)} MB) in ${Date.now() - startedAt} ms`
          );
          resolve({ data: out, error: null, code: 0 });
        } else {
          console.error("ffmpeg failed:", code, errBuf);
          resolve({
            data: null,
            error: `ffmpeg failed (code ${code}): ${errBuf.trim().split(/\r?\n/).pop() || ""}`,
            code,
          });
        }
      });

      ff.on("error", (e) => {
        console.error("ffmpeg spawn error:", e);
        resolve({
          data: null,
          error: `ffmpeg spawn error: ${e.message}`,
          code: null,
        });
      });
    } catch (e) {
      console.error("Error running ffmpeg:", e);
      resolve({
        data: null,
        error: `Error running ffmpeg: ${e.message}`,
        code: null,
      });
    }
  });
});

ipcMain.handle("file:probeDuration", async (_event, filePath) => {
  if (!filePath) return null;
  return ffmpeg.probeDuration(filePath);
});

ipcMain.handle("files:probeDurations", async (event, paths) => {
  if (!paths || !Array.isArray(paths)) return [];
  const uniquePaths = [
    ...new Set(paths.filter((p) => typeof p === "string" && p.trim())),
  ];
  if (!uniquePaths.length) return [];

  if (!(await ffmpeg.getFfmpegPath()) && !(await ffmpeg.getFfprobePath())) {
    console.warn("no ffmpeg/ffprobe available for batch probe");
    return [];
  }

  // a few probes in flight at once: faster than one by one, without
  // spawning a process per file for a 2,000-track folder
  const PROBE_CONCURRENCY = 4;
  return mapWithConcurrency(uniquePaths, PROBE_CONCURRENCY, async (p) => {
    let size = null;
    let mtimeMs = null;
    let type = null;
    try {
      const st = await fs.stat(p);
      size = typeof st.size === "number" ? st.size : null;
      mtimeMs = typeof st.mtimeMs === "number" ? st.mtimeMs : null;
      const ext = path.extname(p).toLowerCase();
      type = ext || null;
    } catch (e) {}

    const res = await ffmpeg.probeDuration(p);

    try {
      if (!event.sender.isDestroyed()) {
        if (
          res &&
          typeof res.duration === "number" &&
          Number.isFinite(res.duration) &&
          res.duration > 0
        ) {
          event.sender.send("files:probeDurations:progress", {
            path: p,
            duration: res.duration,
          });
        } else if (res && res.error) {
          event.sender.send("files:probeDurations:progress", {
            path: p,
            duration: null,
            error: res.error,
          });
        }
      }
    } catch (e) {}

    return { path: p, size, mtimeMs, type, ...res };
  });
});

ipcMain.handle("binaries:status", async () => {
  try {
    return await ffmpeg.getStatus();
  } catch (e) {
    console.warn("binaries:status failed:", e);
    return { available: false, error: e.message };
  }
});

ipcMain.handle("binaries:redetect", async () => {
  await ffmpeg.resolveBinaries({ force: true });
  return ffmpeg.getStatus();
});

ipcMain.handle("binaries:downloadSize", async () => {
  return ffmpeg.getDownloadSize();
});

ipcMain.handle("binaries:download", async (event) => {
  try {
    const result = await ffmpeg.downloadFfmpeg((binary, downloaded, total) => {
      try {
        if (event.sender.isDestroyed()) return;
        event.sender.send("binaries:downloadProgress", {
          binary,
          downloaded,
          total,
          percent: total ? Math.round((downloaded / total) * 100) : 0,
        });
      } catch (e) {}
    });
    return { success: true, ...result, status: await ffmpeg.getStatus() };
  } catch (e) {
    console.error("Failed to download ffmpeg:", e);
    return { success: false, error: e.message, code: e.code || null };
  }
});

ipcMain.handle("binaries:removeDownloaded", async () => {
  const result = await ffmpeg.removeDownloaded();
  return { ...result, status: await ffmpeg.getStatus() };
});

// lets the user point audinspect at an ffmpeg/ffprobe binary of their own
ipcMain.handle("binaries:browse", async (event, kind) => {
  if (kind !== "ffmpeg" && kind !== "ffprobe") return { ok: false };
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: `locate ${kind}`,
    properties: ["openFile", "showHiddenFiles"],
    ...(process.platform === "win32" && {
      filters: [
        { name: kind, extensions: ["exe"] },
        { name: "All Files", extensions: ["*"] },
      ],
    }),
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return { ok: false, canceled: true };
  }
  const chosen = result.filePaths[0];
  const valid = await ffmpeg.validateBinary(chosen, kind);
  if (!valid) {
    return {
      ok: false,
      error: `${path.basename(chosen)} did not respond like ${kind} (ran it with -version)`,
    };
  }
  settingsStore.setSettings({ [`${kind}Path`]: chosen });
  await ffmpeg.resolveBinaries({ force: true });
  return { ok: true, path: chosen, status: await ffmpeg.getStatus() };
});

ipcMain.handle("binaries:dismissPrompt", async (_event, dismissed) => {
  settingsStore.setSettings({ binariesPromptDismissed: !!dismissed });
  return null;
});

// ---------------------------------------------------------------------------
// cache
// ---------------------------------------------------------------------------
ipcMain.handle("cache:info", async () => cache.getCacheInfo());

ipcMain.handle("cache:clearImports", async () => {
  const result = await cache.clearImports();
  return { ...result, info: await cache.getCacheInfo() };
});

// ---------------------------------------------------------------------------
// app lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  const mainWindow = createWindow();

  // files passed on the command line at launch (windows / linux)
  queueOpenPaths(extractOpenPathsFromArgv(process.argv, process.cwd()));

  // housekeeping that must not delay the window
  cache.cleanupLegacyTemp().catch(() => {});
  cache.enforceLimit().catch(() => {});
  ffmpeg.resolveBinaries().catch(() => {});

  const playbackState = { isPlaying: false };

  const sendToRenderer = (channel, ...args) => {
    try {
      const win = BrowserWindow.getAllWindows().find(
        (w) => w && !w.isDestroyed()
      );
      if (win) {
        win.webContents.send(channel, ...args);
      }
    } catch (e) {
      console.warn(`Failed to send ${channel} to renderer:`, e);
    }
  };

  const updateThumbarButtons = (win, isPlaying) => {
    if (!win || win.isDestroyed() || process.platform !== "win32") return;
    try {
      const resourcesDir = path.join(__dirname, "../resources");
      const appIcon = nativeImage.createFromPath(
        path.join(resourcesDir, "icon.png")
      );

      const prevIconRaw = nativeImage.createFromPath(
        path.join(resourcesDir, "skip-back.png")
      );
      const nextIconRaw = nativeImage.createFromPath(
        path.join(resourcesDir, "skip-forward.png")
      );
      const playIconRaw = nativeImage.createFromPath(
        path.join(resourcesDir, "play.png")
      );
      const pauseIconRaw = nativeImage.createFromPath(
        path.join(resourcesDir, "pause.png")
      );

      const prevIcon =
        prevIconRaw && !prevIconRaw.isEmpty() ? prevIconRaw : appIcon;
      const nextIcon =
        nextIconRaw && !nextIconRaw.isEmpty() ? nextIconRaw : appIcon;
      const playIcon =
        playIconRaw && !playIconRaw.isEmpty() ? playIconRaw : appIcon;
      const pauseIcon =
        pauseIconRaw && !pauseIconRaw.isEmpty() ? pauseIconRaw : appIcon;

      const playPauseIcon = isPlaying ? pauseIcon : playIcon;

      win.setThumbarButtons([
        {
          tooltip: "previous",
          icon: prevIcon,
          click: () => sendToRenderer("media:previous"),
        },
        {
          tooltip: isPlaying ? "pause" : "play",
          icon: playPauseIcon,
          click: () => sendToRenderer("media:playPause"),
        },
        {
          tooltip: "next",
          icon: nextIcon,
          click: () => sendToRenderer("media:next"),
        },
      ]);
    } catch (e) {
      console.warn("Failed to update thumbar buttons:", e);
    }
  };

  ipcMain.handle("player:updatePlaybackState", (_event, isPlaying) => {
    try {
      playbackState.isPlaying = !!isPlaying;
      const win = BrowserWindow.getAllWindows().find(
        (w) => w && !w.isDestroyed()
      );
      if (win) updateThumbarButtons(win, playbackState.isPlaying);
    } catch (e) {
      console.warn("Failed to handle player:updatePlaybackState:", e);
    }
    return null;
  });

  try {
    globalShortcut.register("MediaPlayPause", () => {
      sendToRenderer("media:playPause");
    });
    globalShortcut.register("MediaNextTrack", () => {
      sendToRenderer("media:next");
    });
    globalShortcut.register("MediaPreviousTrack", () => {
      sendToRenderer("media:previous");
    });
  } catch (e) {
    console.warn("Failed to register media key shortcuts:", e);
  }

  updateThumbarButtons(mainWindow, playbackState.isPlaying);

  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Settings…",
                accelerator: "CmdOrCtrl+,",
                click: () => sendToRenderer("menu:openSettings"),
              },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Files…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendToRenderer("menu:openFiles"),
        },
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => sendToRenderer("menu:openFolder"),
        },
        { type: "separator" },
        ...(process.platform !== "darwin"
          ? [
              {
                label: "Settings…",
                accelerator: "CmdOrCtrl+,",
                click: () => sendToRenderer("menu:openSettings"),
              },
              { type: "separator" },
            ]
          : []),
        { role: "quit" },
      ],
    },

    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}
});

app.on("window-all-closed", () => {
  stopFolderWatcher();
  rendererAcceptsOpens = null;
  if (process.platform !== "darwin") {
    app.quit();
  }
});
