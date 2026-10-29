// everything audinspect writes to disk on its own behalf lives under
// userData and is capped by settings.maxCacheMB:
//   userData/bin            downloaded ffmpeg (never auto-evicted)
//   userData/cache/imports  temporary copies of dropped files that have no
//                           real path (e.g. dragged in from a browser)
// older audinspect versions wrote import copies to the os temp dir and never
// removed them; cleanupLegacyTemp() sweeps those on startup.
const path = require("node:path");
const fs = require("node:fs");
const fsp = fs.promises;
const os = require("node:os");
const { app } = require("electron");
const { getMaxCacheBytes } = require("./settings-store");

function getBinariesDir() {
  return path.join(app.getPath("userData"), "bin");
}

function getImportsDir() {
  return path.join(app.getPath("userData"), "cache", "imports");
}

async function listFiles(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      try {
        const st = await fsp.stat(full);
        out.push({ path: full, size: st.size, mtimeMs: st.mtimeMs });
      } catch (e) {}
    }
  }
  return out;
}

function sumSizes(files) {
  return files.reduce((acc, f) => acc + (f.size || 0), 0);
}

async function getCacheInfo() {
  const [binaries, imports] = await Promise.all([
    listFiles(getBinariesDir()),
    listFiles(getImportsDir()),
  ]);
  const binariesBytes = sumSizes(binaries);
  const importsBytes = sumSizes(imports);
  return {
    binariesDir: getBinariesDir(),
    importsDir: getImportsDir(),
    binariesBytes,
    importsBytes,
    importsCount: imports.length,
    totalBytes: binariesBytes + importsBytes,
    maxBytes: getMaxCacheBytes(),
  };
}

// evict the oldest import copies until binaries + imports fit under the cap.
// downloaded binaries are never removed here: they would just get
// re-downloaded, which is the opposite of saving space.
async function enforceLimit() {
  const maxBytes = getMaxCacheBytes();
  const binariesBytes = sumSizes(await listFiles(getBinariesDir()));
  const imports = (await listFiles(getImportsDir())).sort(
    (a, b) => a.mtimeMs - b.mtimeMs
  );
  let total = binariesBytes + sumSizes(imports);
  let removed = 0;
  let freedBytes = 0;
  for (const file of imports) {
    if (total <= maxBytes) break;
    try {
      await fsp.unlink(file.path);
      total -= file.size;
      removed += 1;
      freedBytes += file.size;
    } catch (e) {}
  }
  return { removed, freedBytes, totalBytes: total, maxBytes };
}

function safeBaseName(name) {
  const base = path.basename(String(name || "import"));
  return base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "import";
}

// writes a dropped file's bytes into the imports cache. returns
// { path } or { path: null, error }.
async function writeImport(fileName, bytes) {
  const buffer = Buffer.from(bytes);
  const maxBytes = getMaxCacheBytes();
  const binariesBytes = sumSizes(await listFiles(getBinariesDir()));
  if (binariesBytes + buffer.length > maxBytes) {
    return {
      path: null,
      error: `file is larger than the free cache space (${formatMB(
        maxBytes - binariesBytes
      )} MB). raise the cache limit in settings or open the file from disk.`,
    };
  }

  const dir = getImportsDir();
  await fsp.mkdir(dir, { recursive: true });
  const unique = `${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const dest = path.join(dir, `${unique}_${safeBaseName(fileName)}`);
  await fsp.writeFile(dest, buffer);
  // make room by dropping older imports (never the one we just wrote, it is
  // the newest, unless the cap is smaller than this single file which we
  // already rejected above)
  await enforceLimit();
  return { path: dest, error: null };
}

async function clearImports() {
  const files = await listFiles(getImportsDir());
  let freedBytes = 0;
  for (const f of files) {
    try {
      await fsp.unlink(f.path);
      freedBytes += f.size;
    } catch (e) {}
  }
  return { removed: files.length, freedBytes };
}

// audinspect <= 2.1 wrote `audinspect_<ts>_<name>` copies to os.tmpdir()
async function cleanupLegacyTemp() {
  const tmp = os.tmpdir();
  let entries = [];
  try {
    entries = await fsp.readdir(tmp);
  } catch (e) {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (!name.startsWith("audinspect_")) continue;
    try {
      const full = path.join(tmp, name);
      const st = await fsp.stat(full);
      if (st.isFile()) {
        await fsp.unlink(full);
        removed += 1;
      }
    } catch (e) {}
  }
  return removed;
}

function formatMB(bytes) {
  return (Math.max(0, bytes) / 1024 / 1024).toFixed(1);
}

module.exports = {
  getBinariesDir,
  getImportsDir,
  getCacheInfo,
  enforceLimit,
  writeImport,
  clearImports,
  cleanupLegacyTemp,
  formatMB,
};
