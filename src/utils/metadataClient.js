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

    if (msg.type === "migration:requestLegacy") {
      if (
        typeof window !== "undefined" &&
        window.electronAPI &&
        typeof window.electronAPI.exportLegacyMetadata === "function"
      ) {
        window.electronAPI
          .exportLegacyMetadata()
          .then((res) => {
            const records =
              res && Array.isArray(res.records) ? res.records : [];
            worker.postMessage({
              type: "migration:applyLegacy",
              payload: { records },
            });
          })
          .catch(() => {
            worker.postMessage({
              type: "migration:applyLegacy",
              payload: { records: [] },
            });
          });
      } else {
        worker.postMessage({
          type: "migration:applyLegacy",
          payload: { records: [] },
        });
      }
      return;
    }

    if (msg.type === "migration:deleteLegacy") {
      if (
        typeof window !== "undefined" &&
        window.electronAPI &&
        typeof window.electronAPI.deleteLegacyMetadata === "function"
      ) {
        window.electronAPI.deleteLegacyMetadata().catch(() => {});
      }
      return;
    }

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
