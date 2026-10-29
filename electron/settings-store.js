// tiny json settings file for things the main process needs before the
// renderer is up (binary paths, cache limit). lives in userData/settings.json
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");

const DEFAULTS = Object.freeze({
  // custom ffmpeg/ffprobe binaries chosen by the user ("" = auto detect)
  ffmpegPath: "",
  ffprobePath: "",
  // hard cap for everything audinspect writes to its cache (downloaded
  // binaries + temporary copies of imported files), in megabytes
  maxCacheMB: 100,
  // the user chose "don't ask again" on the ffmpeg download prompt
  binariesPromptDismissed: false,
});

const MIN_CACHE_MB = 10;
const MAX_CACHE_MB = 100000;

let cached = null;

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function sanitize(input) {
  const out = { ...DEFAULTS };
  if (!input || typeof input !== "object") return out;
  if (typeof input.ffmpegPath === "string") out.ffmpegPath = input.ffmpegPath.trim();
  if (typeof input.ffprobePath === "string") out.ffprobePath = input.ffprobePath.trim();
  const mb = Number(input.maxCacheMB);
  if (Number.isFinite(mb)) {
    out.maxCacheMB = Math.round(Math.min(MAX_CACHE_MB, Math.max(MIN_CACHE_MB, mb)));
  }
  if (typeof input.binariesPromptDismissed === "boolean") {
    out.binariesPromptDismissed = input.binariesPromptDismissed;
  }
  return out;
}

function load() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    cached = sanitize(JSON.parse(raw));
  } catch (e) {
    cached = { ...DEFAULTS };
  }
  return cached;
}

function getSettings() {
  return { ...load() };
}

function setSettings(partial) {
  const next = sanitize({ ...load(), ...(partial || {}) });
  cached = next;
  try {
    fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2));
  } catch (e) {
    console.warn("failed to write settings.json:", e);
  }
  return { ...next };
}

function getMaxCacheBytes() {
  return load().maxCacheMB * 1024 * 1024;
}

module.exports = {
  DEFAULTS,
  MIN_CACHE_MB,
  getSettings,
  setSettings,
  getMaxCacheBytes,
  getSettingsPath,
};
