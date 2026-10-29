// finds (or, as a last resort, downloads) ffmpeg for decoding formats the
// browser can't play, and optionally ffprobe for faster metadata reads.
//
// resolution order, per binary:
//   1. custom path from settings.json
//   2. a system install (PATH + the usual package-manager locations)
//   3. ffmpeg-static / ffprobe-static when running from source
//   4. the copy we downloaded to userData/bin
//
// only ffmpeg is ever downloaded: durations can be read with `ffmpeg -i`,
// so shipping ffprobe as well doubled the download for nothing.
const path = require("node:path");
const fs = require("node:fs");
const fsp = fs.promises;
const os = require("node:os");
const https = require("node:https");
const { spawn } = require("node:child_process");
const { app } = require("electron");
const settingsStore = require("./settings-store");
const cache = require("./cache-manager");

const FFMPEG_VERSION = "b6.0";
const RELEASE_BASE_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download";
const EXE = process.platform === "win32" ? ".exe" : "";
const KINDS = ["ffmpeg", "ffprobe"];

function getBinaryInfo() {
  const platform = process.platform;
  const arch = process.arch;
  const known = new Set([
    "win32-x64",
    "win32-ia32",
    "darwin-x64",
    "darwin-arm64",
    "linux-x64",
    "linux-arm64",
    "linux-arm",
    "linux-ia32",
  ]);
  const platformArch = `${platform}-${arch}`;
  return {
    platform,
    arch,
    platformArch,
    supported: known.has(platformArch),
    ffmpegFilename: `ffmpeg${EXE}`,
    ffprobeFilename: `ffprobe${EXE}`,
    ffmpegUrl: `${RELEASE_BASE_URL}/${FFMPEG_VERSION}/ffmpeg-${platformArch}`,
  };
}

function getDownloadedPath(kind) {
  return path.join(cache.getBinariesDir(), `${kind}${EXE}`);
}

function getBundledPath(kind) {
  if (app.isPackaged) return null;
  try {
    if (kind === "ffmpeg") {
      const p = require("ffmpeg-static");
      return typeof p === "string" ? p : null;
    }
    const mod = require("ffprobe-static");
    const p = mod && typeof mod === "object" ? mod.path : mod;
    return typeof p === "string" ? p : null;
  } catch (e) {
    return null;
  }
}

function getSystemCandidateDirs() {
  const dirs = [];
  const pathVar = process.env.PATH || process.env.Path || "";
  pathVar.split(path.delimiter).forEach((d) => d && dirs.push(d));
  const home = os.homedir();
  if (process.platform === "darwin") {
    dirs.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/opt/local/bin",
      "/usr/bin",
      path.join(home, ".local", "bin"),
      path.join(home, "bin")
    );
  } else if (process.platform === "win32") {
    const env = process.env;
    dirs.push(
      "C:\\ffmpeg\\bin",
      env.ProgramFiles && path.join(env.ProgramFiles, "ffmpeg", "bin"),
      env["ProgramFiles(x86)"] &&
        path.join(env["ProgramFiles(x86)"], "ffmpeg", "bin"),
      env.LOCALAPPDATA &&
        path.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"),
      env.LOCALAPPDATA &&
        path.join(env.LOCALAPPDATA, "Programs", "ffmpeg", "bin"),
      env.ProgramData && path.join(env.ProgramData, "chocolatey", "bin"),
      path.join(home, "scoop", "shims")
    );
  } else {
    dirs.push(
      "/usr/bin",
      "/usr/local/bin",
      "/snap/bin",
      "/var/lib/flatpak/exports/bin",
      "/opt/ffmpeg/bin",
      path.join(home, ".local", "bin"),
      path.join(home, "bin")
    );
  }
  return [...new Set(dirs.filter(Boolean))];
}

// runs `<binary> -version` and checks it identifies as the right tool
function validateBinary(filePath, kind) {
  return new Promise((resolve) => {
    if (!filePath || !fs.existsSync(filePath)) {
      resolve(false);
      return;
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    try {
      const child = spawn(filePath, ["-version"], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      let out = "";
      child.stdout.on("data", (d) => {
        if (out.length < 512) out += d.toString();
      });
      child.on("error", () => finish(false));
      child.on("close", (code) => {
        finish(code === 0 && out.trim().toLowerCase().startsWith(`${kind} version`));
      });
      setTimeout(() => {
        try {
          child.kill();
        } catch (e) {}
        finish(false);
      }, 5000);
    } catch (e) {
      finish(false);
    }
  });
}

let resolved = null;
let resolving = null;

async function resolveOne(kind, settings) {
  const custom = settings[`${kind}Path`];
  const result = { path: null, source: null, customInvalid: false };
  if (custom) {
    if (await validateBinary(custom, kind)) {
      return { ...result, path: custom, source: "custom" };
    }
    result.customInvalid = true;
  }
  // validate every existing candidate at once, then keep the first valid
  // one in search order (PATH first, then package-manager locations)
  const candidates = getSystemCandidateDirs()
    .map((dir) => path.join(dir, `${kind}${EXE}`))
    .filter((candidate) => fs.existsSync(candidate));
  const checks = await Promise.all(
    candidates.map((candidate) => validateBinary(candidate, kind))
  );
  const firstValid = checks.indexOf(true);
  if (firstValid >= 0) {
    return { ...result, path: candidates[firstValid], source: "system" };
  }
  const bundled = getBundledPath(kind);
  if (bundled && (await validateBinary(bundled, kind))) {
    return { ...result, path: bundled, source: "bundled" };
  }
  const downloaded = getDownloadedPath(kind);
  if (await validateBinary(downloaded, kind)) {
    return { ...result, path: downloaded, source: "downloaded" };
  }
  return result;
}

async function resolveBinaries({ force = false } = {}) {
  if (resolved && !force) return resolved;
  if (resolving && !force) return resolving;
  resolving = (async () => {
    const settings = settingsStore.getSettings();
    const found = await Promise.all(
      KINDS.map((kind) => resolveOne(kind, settings))
    );
    const next = { checkedAt: Date.now() };
    KINDS.forEach((kind, i) => {
      next[kind] = found[i];
    });
    resolved = next;
    resolving = null;
    return next;
  })();
  return resolving;
}

function invalidate() {
  resolved = null;
}

async function getStatus() {
  const r = await resolveBinaries();
  const settings = settingsStore.getSettings();
  const info = getBinaryInfo();
  const downloadedFfmpeg = getDownloadedPath("ffmpeg");
  const downloadedFfprobe = getDownloadedPath("ffprobe");
  const sizes = await Promise.all(
    [downloadedFfmpeg, downloadedFfprobe].map((p) =>
      fsp.stat(p).then((st) => st.size, () => 0)
    )
  );
  const downloadedBytes = sizes.reduce((a, b) => a + b, 0);
  return {
    available: !!r.ffmpeg.path,
    ffmpeg: r.ffmpeg,
    ffprobe: r.ffprobe,
    ffmpegPath: r.ffmpeg.path,
    ffprobePath: r.ffprobe.path,
    downloadedBytes,
    hasDownloaded: downloadedBytes > 0,
    downloadSupported: info.supported,
    platformArch: info.platformArch,
    customFfmpegPath: settings.ffmpegPath,
    customFfprobePath: settings.ffprobePath,
    promptDismissed: settings.binariesPromptDismissed,
    maxCacheMB: settings.maxCacheMB,
  };
}

async function getFfmpegPath() {
  return (await resolveBinaries()).ffmpeg.path;
}

async function getFfprobePath() {
  return (await resolveBinaries()).ffprobe.path;
}

function request(method, url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("too many redirects"));
      return;
    }
    const req = https.request(
      url,
      { method, headers: { "User-Agent": "audinspect" } },
      (res) => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          resolve(request(method, headers.location, redirects + 1));
          return;
        }
        if (statusCode !== 200) {
          res.resume();
          reject(new Error(`download failed: HTTP ${statusCode}`));
          return;
        }
        resolve(res);
      }
    );
    req.setTimeout(15000, () => {
      req.destroy(new Error("request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

// content-length of the ffmpeg download for this platform, or null
async function getDownloadSize() {
  const info = getBinaryInfo();
  if (!info.supported) return null;
  try {
    const res = await request("HEAD", info.ffmpegUrl);
    res.resume();
    const len = parseInt(res.headers["content-length"], 10);
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch (e) {
    return null;
  }
}

async function downloadToFile(url, destPath, onProgress) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;
  const res = await request("GET", url);
  const total = parseInt(res.headers["content-length"], 10) || 0;
  let downloaded = 0;
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(partPath);
    const fail = (err) => {
      try {
        file.destroy();
      } catch (e) {}
      fsp.unlink(partPath).catch(() => {});
      reject(err);
    };
    res.on("data", (chunk) => {
      downloaded += chunk.length;
      if (onProgress && total) onProgress(downloaded, total);
    });
    res.on("error", fail);
    file.on("error", fail);
    file.on("finish", resolve);
    res.pipe(file);
  });
  if (total && downloaded !== total) {
    await fsp.unlink(partPath).catch(() => {});
    throw new Error("download ended early");
  }
  await fsp.rename(partPath, destPath);
  return downloaded;
}

async function downloadFfmpeg(onProgress) {
  const info = getBinaryInfo();
  if (!info.supported) {
    throw new Error(
      `no prebuilt ffmpeg for ${info.platformArch}. install ffmpeg with your package manager and point audinspect to it in settings.`
    );
  }
  const maxBytes = settingsStore.getMaxCacheBytes();
  const size = await getDownloadSize();
  const existing = (await cache.getCacheInfo()).binariesBytes;
  if (size && existing + size > maxBytes) {
    const err = new Error(
      `the ffmpeg download (${cache.formatMB(size)} MB) would exceed your cache limit of ${settingsStore.getSettings().maxCacheMB} MB. raise the limit in settings, or install ffmpeg system-wide instead.`
    );
    err.code = "CACHE_LIMIT";
    throw err;
  }

  const dest = getDownloadedPath("ffmpeg");
  await downloadToFile(info.ffmpegUrl, dest, (downloaded, total) => {
    if (onProgress) onProgress("ffmpeg", downloaded, total);
  });
  if (process.platform !== "win32") {
    await fsp.chmod(dest, 0o755);
  }
  if (!(await validateBinary(dest, "ffmpeg"))) {
    await fsp.unlink(dest).catch(() => {});
    throw new Error("the downloaded ffmpeg binary does not run on this system");
  }
  await cache.enforceLimit();
  await resolveBinaries({ force: true });
  return { ffmpegPath: dest, size };
}

async function removeDownloaded() {
  const targets = KINDS.flatMap((kind) => [
    getDownloadedPath(kind),
    `${getDownloadedPath(kind)}.part`,
  ]);
  const freed = await Promise.all(
    targets.map(async (p) => {
      try {
        const st = await fsp.stat(p);
        await fsp.unlink(p);
        return st.size;
      } catch (e) {
        return 0;
      }
    })
  );
  await resolveBinaries({ force: true });
  return { freedBytes: freed.reduce((a, b) => a + b, 0) };
}

function runCollect(bin, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d.toString();
      });
      child.stderr.on("data", (d) => {
        if (err.length < 65536) err += d.toString();
      });
      child.on("error", (e) =>
        resolve({ code: null, out, err: `${err}\n${e.message}` })
      );
      child.on("close", (code) => resolve({ code, out, err }));
    } catch (e) {
      resolve({ code: null, out: "", err: e.message });
    }
  });
}

function parseFfmpegDuration(stderr) {
  const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(stderr || "");
  if (!m) return null;
  const dur = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(dur) && dur > 0 ? dur : null;
}

// { duration, error, code, needsDownload }
async function probeDuration(filePath) {
  const r = await resolveBinaries();
  if (r.ffprobe.path) {
    const res = await runCollect(r.ffprobe.path, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    if (res.code === 0) {
      const text = (res.out || "").trim().split(/\r?\n/).pop();
      const dur = parseFloat(text);
      if (Number.isFinite(dur) && dur > 0) {
        return { duration: dur, error: null, code: 0 };
      }
      return { duration: null, error: `ffprobe returned invalid duration: ${text}`, code: 0 };
    }
    return { duration: null, error: `ffprobe failed (code ${res.code}): ${res.err}`, code: res.code };
  }
  if (r.ffmpeg.path) {
    // `ffmpeg -i` with no output exits non-zero but prints the stream info
    const res = await runCollect(r.ffmpeg.path, [
      "-hide_banner",
      "-nostdin",
      "-i",
      filePath,
    ]);
    const dur = parseFfmpegDuration(res.err);
    if (dur != null) return { duration: dur, error: null, code: 0 };
    return {
      duration: null,
      error: `ffmpeg could not read a duration: ${(res.err || "").trim().split(/\r?\n/).pop() || "unknown"}`,
      code: res.code,
    };
  }
  return {
    duration: null,
    error: "ffmpeg is not available. set it up in settings > audio.",
    code: null,
    needsDownload: true,
  };
}

module.exports = {
  getBinaryInfo,
  getDownloadedPath,
  validateBinary,
  resolveBinaries,
  invalidate,
  getStatus,
  getFfmpegPath,
  getFfprobePath,
  getDownloadSize,
  downloadFfmpeg,
  removeDownloaded,
  probeDuration,
  parseFfmpegDuration,
};
