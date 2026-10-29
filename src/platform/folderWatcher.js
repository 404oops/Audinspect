// puter has no file system watch api, so an open folder is re-listed on a
// timer and the differences are reported the way chokidar's events were:
// added/removed paths, and metadata for files whose size or mtime changed.
export function createFolderWatcher({ list, intervalMs = 5000, onFilesDelta, onMetadataDelta }) {
  let folder = null;
  let snapshot = new Map(); // path -> meta
  let timer = null;
  let polling = false;
  let generation = 0;

  const schedule = () => {
    clearTimeout(timer);
    if (!folder) return;
    timer = setTimeout(poll, intervalMs);
  };

  const poll = async () => {
    if (!folder || polling) return;
    if (typeof document !== "undefined" && document.hidden) {
      schedule();
      return;
    }
    polling = true;
    const gen = generation;
    const current = folder;
    try {
      const items = await list(current);
      if (gen !== generation || current !== folder) return;
      const next = new Map();
      const added = [];
      const changed = [];
      items.forEach((meta) => {
        if (!meta || !meta.path) return;
        next.set(meta.path, meta);
        const prev = snapshot.get(meta.path);
        if (!prev) {
          added.push(meta.path);
          changed.push(meta);
        } else if (prev.size !== meta.size || prev.mtimeMs !== meta.mtimeMs) {
          changed.push(meta);
        }
      });
      const removed = [];
      snapshot.forEach((_meta, p) => {
        if (!next.has(p)) removed.push(p);
      });
      snapshot = next;
      if (added.length || removed.length) {
        onFilesDelta?.({ folderPath: current, added, removed });
      }
      if (changed.length) onMetadataDelta?.(changed);
    } catch (e) {
      console.warn("folder poll failed:", e);
    } finally {
      polling = false;
      if (gen === generation) schedule();
    }
  };

  return {
    // `initial` is the listing the ui already has, so the first poll only
    // reports real changes
    start(nextFolder, initial) {
      generation += 1;
      folder = nextFolder;
      snapshot = new Map();
      (initial || []).forEach((meta) => {
        if (meta && meta.path) snapshot.set(meta.path, meta);
      });
      schedule();
    },
    stop() {
      generation += 1;
      folder = null;
      snapshot = new Map();
      clearTimeout(timer);
      timer = null;
    },
    get folder() {
      return folder;
    },
  };
}
