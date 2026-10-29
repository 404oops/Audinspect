// talks to the indexeddb metadata cache (sizes, mtimes, durations) that
// lives in a worker so a 2,000-track folder never blocks the ui thread.
// the browser owns this storage; nothing is written anywhere else.
let workerInstance = null;
let nextMessageId = 1;
const pending = new Map();
let initPromise = null;

function ensureWorker() {
  if (workerInstance) return workerInstance;

  const worker = new Worker(
    new URL("../workers/metadataWorker.js", import.meta.url),
    { type: "module" }
  );

  worker.onmessage = (event) => {
    const msg = event.data || {};
    const { id } = msg;
    if (!id) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);

    if (msg.ok === false) {
      entry.reject(new Error(msg.error || "worker error"));
    } else {
      entry.resolve(msg.payload);
    }
  };

  worker.onerror = (err) => {
    pending.forEach((entry) => {
      entry.reject(err);
    });
    pending.clear();
  };

  workerInstance = worker;
  return workerInstance;
}

function callWorker(type, payload) {
  const worker = ensureWorker();
  const id = nextMessageId;
  nextMessageId += 1;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export function initMetadataClient() {
  if (initPromise) return initPromise;
  initPromise = callWorker("init", null).catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

export async function saveMetadataFromStatResults(items) {
  if (!Array.isArray(items) || !items.length) return;
  try {
    await initMetadataClient();
  } catch (_e) {
    return;
  }
  try {
    await callWorker("upsertFromMetadata", { items });
  } catch (_e) {}
}

export async function saveDurationsFromProbeResults(items) {
  if (!Array.isArray(items) || !items.length) return;
  try {
    await initMetadataClient();
  } catch (_e) {
    return;
  }
  try {
    await callWorker("upsertFromProbeResults", { items });
  } catch (_e) {}
}

export async function getCachedDurationsForPaths(paths, metadataByPath) {
  const list = Array.isArray(paths) ? paths : [];
  if (!list.length) return [];
  try {
    await initMetadataClient();
  } catch (_e) {
    return [];
  }
  try {
    const payload = {
      paths: list,
      metadataByPath:
        metadataByPath && typeof metadataByPath === "object"
          ? metadataByPath
          : {},
    };
    const result = await callWorker("getCachedDurationsForPaths", payload);
    return Array.isArray(result) ? result : [];
  } catch (_e) {
    return [];
  }
}

export async function getMetadataCacheStats() {
  try {
    await initMetadataClient();
    const stats = await callWorker("stats", null);
    return stats && typeof stats === "object" ? stats : { tracks: 0 };
  } catch (_e) {
    return { tracks: 0 };
  }
}

export async function clearMetadataCache() {
  await initMetadataClient();
  await callWorker("clear", null);
}
