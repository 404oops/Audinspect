import Dexie from "dexie";

const db = new Dexie("audinspect-metadata");

db.version(1).stores({
  tracks:
    "&path,size,mtimeMs,mtimeIso,type,duration,createdAt,updatedAt",
  meta: "&key,value",
});

const META_KEYS = {
  LEGACY_MIGRATION_COMPLETE: "legacyMigrationComplete",
};

async function isLegacyMigrationComplete() {
  try {
    const row = await db.table("meta").get(META_KEYS.LEGACY_MIGRATION_COMPLETE);
    return !!(row && row.value && row.value.completed);
  } catch (_e) {
    return false;
  }
}

async function markLegacyMigrationComplete(info) {
  const value = {
    completed: true,
    migratedAt: Date.now(),
    ...(info || {}),
  };
  try {
    await db.table("meta").put({ key: META_KEYS.LEGACY_MIGRATION_COMPLETE, value });
  } catch (_e) {}
}

function normalizeNumber(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeString(v) {
  return typeof v === "string" && v ? v : null;
}

// one bulkGet for all paths instead of a get per item
async function loadExistingRows(paths) {
  try {
    const rows = await db.table("tracks").bulkGet(paths);
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

function keepExisting(existing, key, normalize) {
  return existing ? normalize(existing[key]) : null;
}

async function upsertFromMetadata(items) {
  if (!Array.isArray(items) || !items.length) return;
  const now = Date.now();
  const valid = items.filter((item) => item && item.path);
  if (!valid.length) return;
  const paths = valid.map((item) => String(item.path));
  const existingRows = await loadExistingRows(paths);

  const rows = valid.map((item, i) => {
    const existing = existingRows[i] || null;
    return {
      path: paths[i],
      size:
        normalizeNumber(item.size) ??
        keepExisting(existing, "size", normalizeNumber),
      mtimeMs:
        normalizeNumber(item.mtimeMs) ??
        keepExisting(existing, "mtimeMs", normalizeNumber),
      mtimeIso:
        normalizeString(item.mtimeIso) ??
        keepExisting(existing, "mtimeIso", normalizeString),
      type:
        normalizeString(item.type) ??
        keepExisting(existing, "type", normalizeString),
      duration: keepExisting(existing, "duration", normalizeNumber),
      createdAt: keepExisting(existing, "createdAt", normalizeNumber) ?? now,
      updatedAt: now,
    };
  });

  try {
    await db.table("tracks").bulkPut(rows);
  } catch (_e) {}
}

async function upsertFromProbeResults(items) {
  if (!Array.isArray(items) || !items.length) return;
  const now = Date.now();
  const valid = items.filter((item) => item && item.path);
  if (!valid.length) return;
  const paths = valid.map((item) => String(item.path));
  const existingRows = await loadExistingRows(paths);

  const rows = valid.map((item, i) => {
    const existing = existingRows[i] || null;
    const duration = normalizeNumber(item.duration);
    return {
      path: paths[i],
      size:
        normalizeNumber(item.size) ??
        keepExisting(existing, "size", normalizeNumber),
      mtimeMs:
        normalizeNumber(item.mtimeMs) ??
        keepExisting(existing, "mtimeMs", normalizeNumber),
      mtimeIso:
        normalizeString(item.mtimeIso) ??
        keepExisting(existing, "mtimeIso", normalizeString),
      type:
        normalizeString(item.type) ??
        keepExisting(existing, "type", normalizeString),
      duration:
        duration != null
          ? duration
          : keepExisting(existing, "duration", normalizeNumber),
      createdAt: keepExisting(existing, "createdAt", normalizeNumber) ?? now,
      updatedAt: now,
    };
  });

  try {
    await db.table("tracks").bulkPut(rows);
  } catch (_e) {}
}

async function getCachedDurationsForPaths(payload) {
  const paths = Array.isArray(payload?.paths) ? payload.paths : [];
  const metadataByPath = payload?.metadataByPath || {};
  if (!paths.length) return [];

  let rows = [];
  try {
    rows = await db.table("tracks").bulkGet(paths);
  } catch (_e) {
    rows = [];
  }

  const result = [];

  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i];
    const row = rows[i];
    if (!row || !row.path) continue;

    const meta = metadataByPath[path] || {};
    const size = normalizeNumber(meta.size);
    const mtimeMs = normalizeNumber(meta.mtimeMs);

    const dur = normalizeNumber(row.duration);
    if (
      dur != null &&
      dur > 0 &&
      (row.size == null || size == null || normalizeNumber(row.size) === size) &&
      (row.mtimeMs == null || mtimeMs == null ||
        normalizeNumber(row.mtimeMs) === mtimeMs)
    ) {
      result.push({ path, duration: dur });
    }
  }

  return result;
}

async function applyLegacyRecords(records) {
  if (!Array.isArray(records) || !records.length) {
    await markLegacyMigrationComplete({ recordCount: 0 });
    try {
      self.postMessage({ type: "migration:deleteLegacy" });
    } catch (_e) {}
    return;
  }

  const now = Date.now();
  const rows = [];

  for (const rec of records) {
    if (!rec || !rec.path) continue;
    const path = String(rec.path);

    rows.push({
      path,
      size: normalizeNumber(rec.size),
      mtimeMs: normalizeNumber(rec.mtimeMs),
      mtimeIso: normalizeString(rec.mtimeIso),
      type: normalizeString(rec.type),
      duration: normalizeNumber(rec.duration),
      createdAt:
        normalizeNumber(rec.createdAt) != null
          ? normalizeNumber(rec.createdAt)
          : now,
      updatedAt: now,
    });
  }

  if (rows.length) {
    let wrote = false;
    try {
      await db.table("tracks").bulkPut(rows);
      wrote = true;
    } catch (_e) {}

    if (!wrote) {
      return;
    }
  }

  await markLegacyMigrationComplete({ recordCount: rows.length });

  try {
    self.postMessage({ type: "migration:deleteLegacy" });
  } catch (_e) {}
}

self.onmessage = async (event) => {
  const message = event.data || {};
  const { id, type, payload } = message;

  const reply = (response) => {
    if (!id) return;
    self.postMessage({ id, ...response });
  };

  try {
    if (type === "init") {
      const migrated = await isLegacyMigrationComplete();
      reply({
        ok: true,
        type: "init:result",
        payload: { legacyMigrationComplete: migrated },
      });
      if (!migrated) {
        self.postMessage({ type: "migration:requestLegacy" });
      }
      return;
    }

    if (type === "upsertFromMetadata") {
      await upsertFromMetadata(payload?.items || []);
      reply({ ok: true, type: "upsertFromMetadata:result", payload: null });
      return;
    }

    if (type === "upsertFromProbeResults") {
      await upsertFromProbeResults(payload?.items || []);
      reply({ ok: true, type: "upsertFromProbeResults:result", payload: null });
      return;
    }

    if (type === "getCachedDurationsForPaths") {
      const result = await getCachedDurationsForPaths(payload || {});
      reply({
        ok: true,
        type: "getCachedDurationsForPaths:result",
        payload: result,
      });
      return;
    }

    if (type === "migration:applyLegacy") {
      const records = payload?.records || [];
      await applyLegacyRecords(records);
      reply({ ok: true, type: "migration:applyLegacy:result", payload: null });
      return;
    }

    reply({ ok: false, type: "error", error: "unknown worker message type" });
  } catch (e) {
    reply({
      ok: false,
      type: "error",
      error: e && e.message ? e.message : String(e),
    });
  }
};
