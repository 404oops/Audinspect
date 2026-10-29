// everything the player needs from its host, implemented on puter.js. this
// is the browser counterpart of electron/preload.js: the same operations the
// renderer used to get over ipc, now backed by puter.fs / puter.ui / puter.kv
// and the in-memory registry for files dropped in from outside puter.
import { puterReady, getPuter, isSignedIn } from "./puterClient";
import {
  AUDIO_EXTENSION_LIST,
  isAudioName,
  getExtension,
} from "../utils/audioExtensions";
import { createFolderWatcher } from "./folderWatcher";
import {
  isVirtualPath,
  getVirtualFile,
  virtualFileMetadata,
} from "./virtualFiles";
import { probeDuration } from "../audio/probeDuration";

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

// ---------------------------------------------------------------------------
// small event emitter: subscriptions return their unsubscribe function
// ---------------------------------------------------------------------------
function createEmitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (typeof fn !== "function") return () => {};
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((fn) => {
        try {
          fn(...args);
        } catch (e) {
          console.warn(`${event} listener failed:`, e);
        }
      });
    },
  };
}

const events = createEmitter();

// ---------------------------------------------------------------------------
// fs entries -> the metadata shape the ui expects
// ---------------------------------------------------------------------------
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// puter reports unix seconds; accept milliseconds too, just in case
function toMs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

// the desktop hands apps privacy-aware paths ("~/Desktop/x.mp3") while
// readdir/stat answer with absolute ones; both must compare equal
let homePrefix = null; // "/username"

function normalizePath(p) {
  if (typeof p !== "string") return p;
  if (homePrefix && (p === "~" || p.startsWith("~/"))) {
    return homePrefix + p.slice(1);
  }
  return p;
}

async function learnHome(puter) {
  try {
    const user = await puter.auth.getUser();
    if (user && user.username) homePrefix = `/${user.username}`;
  } catch (e) {}
}

const isDirEntry = (item) =>
  !!(item && (item.is_dir || item.isDir || item.isDirectory || item.fsentry_is_dir));
const entryPath = (item) =>
  normalizePath((item && (item.path || item.fsentry_path)) || null);
const entryName = (item) =>
  (item && (item.name || item.fsentry_name)) ||
  (entryPath(item) || "").split("/").pop() ||
  "";

function entryToMeta(item) {
  const path = entryPath(item);
  if (!path) return null;
  const mtimeMs = toMs(item.modified ?? item.fsentry_modified);
  return {
    path,
    size: num(item.size ?? item.fsentry_size),
    mtimeMs,
    mtimeIso: mtimeMs != null ? new Date(mtimeMs).toISOString() : null,
    type: getExtension(entryName(item)) || null,
  };
}

// stat results seen so far, so listing a folder is enough to fill the
// playlist's size / date columns without a stat call per file
const statCache = new Map();

function remember(meta) {
  if (meta && meta.path) statCache.set(meta.path, meta);
  return meta;
}

function rememberIfComplete(item) {
  const meta = entryToMeta(item);
  if (meta && meta.size != null && meta.mtimeMs != null) remember(meta);
}

function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    const i = next++;
    if (i >= items.length) return undefined;
    results[i] = await fn(items[i], i);
    return run();
  };
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    run
  );
  return Promise.all(workers).then(() => results);
}

async function requirePuter() {
  const puter = await puterReady();
  if (!puter) throw new Error("puter.js is not available");
  return puter;
}

// ---------------------------------------------------------------------------
// directory listing
// ---------------------------------------------------------------------------
async function listManually(puter, dir) {
  const entries = await puter.fs.readdir(dir);
  const parts = await Promise.all(
    (Array.isArray(entries) ? entries : entries?.items || []).map(async (entry) => {
      if (isDirEntry(entry)) {
        // an unreadable subfolder shouldn't hide the rest of the tree
        return listManually(puter, entryPath(entry)).catch(() => []);
      }
      return [entry];
    })
  );
  return parts.flat();
}

async function listDirectoryRecursive(folderPath) {
  const puter = await requirePuter();
  let items;
  try {
    const result = await puter.fs.readdir(folderPath, { recursive: true, depth: 10 });
    items = Array.isArray(result) ? result : result?.items || [];
  } catch (e) {
    return listManually(puter, folderPath);
  }
  // a server that ignores `recursive` answers with the top level only
  const prefix = folderPath.replace(/\/+$/, "") + "/";
  const dirs = items.filter(isDirEntry);
  const hasDeep = items.some(
    (it) => !isDirEntry(it) && (entryPath(it) || "").slice(prefix.length).includes("/")
  );
  if (dirs.length && !hasDeep) {
    const nested = await Promise.all(
      dirs.map((d) => listManually(puter, entryPath(d)).catch(() => []))
    );
    items = items.concat(nested.flat());
  }
  return items;
}

async function listAudioMetas(folderPath) {
  const items = await listDirectoryRecursive(folderPath);
  return items
    .filter((it) => !isDirEntry(it) && isAudioName(entryName(it)))
    .map(entryToMeta)
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(remember);
}

async function statMeta(path) {
  if (isVirtualPath(path)) {
    const meta = virtualFileMetadata(path);
    if (!meta) throw new Error("dropped file is no longer available");
    return meta;
  }
  const cached = statCache.get(path);
  if (cached) return cached;
  const puter = await requirePuter();
  const item = await puter.fs.stat(path);
  const meta = entryToMeta(item);
  if (!meta) throw new Error(`stat returned nothing for ${path}`);
  return remember(meta);
}

// ---------------------------------------------------------------------------
// folder watching (polling, see folderWatcher.js)
// ---------------------------------------------------------------------------
const watcher = createFolderWatcher({
  list: listAudioMetas,
  onFilesDelta: (payload) => events.emit("folder:filesDelta", payload),
  onMetadataDelta: (items) => events.emit("files:metadataDelta", items),
});

// ---------------------------------------------------------------------------
// files handed over by puter: double-click, "open with…", ?file= links.
// queued until the player asks for them, like the electron main process did.
// ---------------------------------------------------------------------------
let pendingOpenPaths = [];
let rendererAcceptsOpens = false;
const recentlyOpened = new Map(); // path -> timestamp

// puter.js reports a launch item through both onLaunchedWithItems and the
// older onItemsOpened, and a drop through onItemsOpened as well as the
// `drop` dom event; one path within a couple of seconds is one request.
export function markPathsHandled(paths) {
  const now = Date.now();
  paths.forEach((p) => recentlyOpened.set(p, now));
}

function filterFreshPaths(paths) {
  const now = Date.now();
  recentlyOpened.forEach((ts, p) => {
    if (now - ts > 2000) recentlyOpened.delete(p);
  });
  const fresh = paths.filter((p) => !recentlyOpened.has(p));
  markPathsHandled(fresh);
  return fresh;
}

function queueOpenItems(items) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  list.forEach(rememberIfComplete);
  const paths = filterFreshPaths(list.map(entryPath).filter(Boolean));
  if (!paths.length) return;
  if (rendererAcceptsOpens) {
    events.emit("files:open", paths);
    return;
  }
  pendingOpenPaths.push(...paths);
}

// ---------------------------------------------------------------------------
// items dragged out of the puter desktop onto the app. the desktop posts an
// `itemsOpened` message first and a `drop` message (with the pointer
// position) right after; puter.js turns the latter into a dom CustomEvent on
// the element under the pointer. the dom event is preferred because it says
// where the drop landed; `itemsOpened` only serves as a fallback for a drop
// that never got a position.
// ---------------------------------------------------------------------------
let pendingDrop = null;

function emitPuterDrop(paths, position) {
  const fresh = filterFreshPaths(paths);
  if (!fresh.length) return;
  events.emit("puter:drop", { paths: fresh, ...position });
}

function onItemsOpened(items) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  list.forEach(rememberIfComplete);
  const paths = list.map(entryPath).filter(Boolean);
  if (!paths.length) return;
  if (pendingDrop) clearTimeout(pendingDrop.timer);
  pendingDrop = {
    paths,
    timer: setTimeout(() => {
      pendingDrop = null;
      emitPuterDrop(paths, { clientX: null, clientY: null });
    }, 250),
  };
}

function onDomDrop(e) {
  const detail = e && e.detail;
  if (!detail || !Array.isArray(detail.items)) return; // a real drag-and-drop, not puter's
  if (pendingDrop) {
    clearTimeout(pendingDrop.timer);
    pendingDrop = null;
  }
  const paths = detail.items.map(entryPath).filter(Boolean);
  emitPuterDrop(paths, { clientX: detail.clientX, clientY: detail.clientY });
}

// ---------------------------------------------------------------------------
// keyboard shortcuts (the application menu of the desktop app). no puter
// menubar: in puter's full-page app mode the menubar strip is laid over the
// window without shrinking the app's iframe, which cut the bottom of the
// playlist off, and everything in that menu is already reachable in the ui.
// ---------------------------------------------------------------------------
function onShortcut(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "o") {
    e.preventDefault();
    events.emit(e.shiftKey ? "menu:openFolder" : "menu:openFiles");
  } else if (key === "," && !e.shiftKey) {
    e.preventDefault();
    events.emit("menu:openSettings");
  }
}

let initialized = false;

export async function initPlatform() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("keydown", onShortcut);

  const puter = await puterReady();
  if (!puter) {
    console.warn("puter.js did not load; file access is unavailable");
    return;
  }
  try {
    puter.ui.setWindowTitle("Audinspect");
  } catch (e) {}
  // on a plain web page an authenticated call would pop up the sign-in
  // dialog; only ask once the user is signed in (always true inside puter)
  if (await isSignedIn()) await learnHome(puter);
  // order matters: the launch item reaches both callbacks, and the first
  // one marks it handled so the second doesn't treat it as a drop
  try {
    puter.ui.onLaunchedWithItems(queueOpenItems);
  } catch (e) {}
  try {
    puter.ui.onItemsOpened((items) => {
      const list = Array.isArray(items) ? items : [items];
      const paths = list.map(entryPath).filter(Boolean);
      if (paths.every((p) => recentlyOpened.has(p))) return;
      onItemsOpened(list);
    });
  } catch (e) {}
  window.addEventListener("drop", onDomDrop, true);
}

// ---------------------------------------------------------------------------
// the api surface the player uses
// ---------------------------------------------------------------------------
export const platform = {
  kind: "puter",

  isAvailable: () => !!getPuter(),

  async openFolder() {
    const puter = await requirePuter();
    const picker = puter.ui.showDirectoryPicker();
    const picked = await (picker.undefinedOnCancel || picker);
    if (!picked) return null;
    const item = Array.isArray(picked) ? picked[0] : picked;
    return entryPath(item);
  },

  async openFiles() {
    const puter = await requirePuter();
    const picker = puter.ui.showOpenFilePicker({
      multiple: true,
      accept: AUDIO_EXTENSION_LIST.map((ext) => `.${ext}`),
    });
    const picked = await (picker.undefinedOnCancel || picker);
    if (!picked) return [];
    const items = Array.isArray(picked) ? picked : [picked];
    items.forEach(rememberIfComplete);
    return items.map(entryPath).filter(Boolean);
  },

  async readAudioFiles(folderPath) {
    if (!folderPath) return [];
    try {
      const metas = await listAudioMetas(folderPath);
      return metas.map((m) => m.path);
    } catch (err) {
      console.error("Error reading audio files:", err);
      return [];
    }
  },

  // expands a mix of file and folder paths into the audio files they
  // contain. `unsupported` counts the top-level files that were skipped.
  async expandPaths(paths) {
    const input = Array.isArray(paths)
      ? paths.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim())
      : [];
    const results = await Promise.all(
      input.map(async (p) => {
        if (isVirtualPath(p)) {
          return getVirtualFile(p) && isAudioName(p) ? { files: [p] } : { unsupported: true };
        }
        try {
          const puter = await requirePuter();
          const item = await puter.fs.stat(p);
          if (isDirEntry(item)) {
            const metas = await listAudioMetas(p);
            return { files: metas.map((m) => m.path), folder: true };
          }
          remember(entryToMeta(item));
          return isAudioName(p) ? { files: [p] } : { unsupported: true };
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
  },

  async getFileMetadata(paths) {
    const unique = [
      ...new Set((paths || []).filter((p) => typeof p === "string" && p.trim())),
    ];
    if (!unique.length) return [];
    return mapWithConcurrency(unique, 8, (p) =>
      statMeta(p).catch((e) => {
        console.warn("Failed to stat for metadata:", p, e);
        return { path: p };
      })
    );
  },

  // the whole file as a Blob (a File for dropped-in files)
  async readFile(path) {
    if (isVirtualPath(path)) {
      const file = getVirtualFile(path);
      if (!file) throw new Error("dropped file is no longer available");
      return file;
    }
    const puter = await requirePuter();
    return puter.fs.read(path);
  },

  // bytes [start, end) without downloading the rest; used by the duration
  // probe so a folder of long files doesn't have to be fetched whole
  async readRange(path, start, end) {
    const length = Math.max(0, end - start);
    if (isVirtualPath(path)) {
      const file = getVirtualFile(path);
      if (!file) throw new Error("dropped file is no longer available");
      return new Uint8Array(await file.slice(start, end).arrayBuffer());
    }
    const puter = await requirePuter();
    const blob = await puter.fs.read(path, { offset: start, byte_count: length });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // a server that ignored the range would answer with the whole file
    if (bytes.length > length) {
      return bytes.length >= end ? bytes.subarray(start, end) : bytes.subarray(0, length);
    }
    return bytes;
  },

  watchFolder(folderPath) {
    if (!folderPath) {
      watcher.stop();
      return Promise.resolve(null);
    }
    const prefix = folderPath.replace(/\/+$/, "") + "/";
    const initial = [];
    statCache.forEach((meta, p) => {
      if (p.startsWith(prefix)) initial.push(meta);
    });
    watcher.start(folderPath, initial);
    return Promise.resolve(null);
  },

  unwatchFolder() {
    watcher.stop();
    return Promise.resolve(null);
  },

  onFolderFilesDelta: (cb) => events.on("folder:filesDelta", cb),
  onFilesMetadataDelta: (cb) => events.on("files:metadataDelta", cb),

  getPendingOpenFiles() {
    rendererAcceptsOpens = true;
    const list = pendingOpenPaths;
    pendingOpenPaths = [];
    return Promise.resolve(list);
  },
  onOpenFiles: (cb) => events.on("files:open", cb),

  // puter items dropped onto the window: { paths, clientX, clientY }
  onPuterDrop: (cb) => events.on("puter:drop", cb),

  onMenuOpenFolder: (cb) => events.on("menu:openFolder", cb),
  onMenuOpenFiles: (cb) => events.on("menu:openFiles", cb),
  onMenuOpenSettings: (cb) => events.on("menu:openSettings", cb),

  // track lengths for the playlist; a few in flight at once, each reported
  // through onProbeDurationsProgress as soon as it is known
  async probeDurationsForFiles(paths) {
    const unique = [
      ...new Set((paths || []).filter((p) => typeof p === "string" && p.trim())),
    ];
    if (!unique.length) return [];
    return mapWithConcurrency(unique, 3, async (p) => {
      const meta = await statMeta(p).catch(() => null);
      const ext = getExtension(p);
      let duration = null;
      let error = null;
      try {
        duration = await probeDuration({
          ext,
          size: meta?.size ?? null,
          read: (start, end) => platform.readRange(p, start, end),
        });
      } catch (e) {
        error = e && e.message ? e.message : String(e);
      }
      events.emit("files:probeDurations:progress", { path: p, duration, error });
      return {
        path: p,
        size: meta?.size ?? null,
        mtimeMs: meta?.mtimeMs ?? null,
        type: ext || null,
        duration,
        error,
      };
    });
  },
  onProbeDurationsProgress: (cb) => events.on("files:probeDurations:progress", cb),

  openExternal(url) {
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  },

  getAppVersion: () => Promise.resolve(APP_VERSION),
};

export default platform;
