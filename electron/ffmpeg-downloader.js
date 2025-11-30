// downloads ffmpeg/ffprobe binaries on first launch
// uses binaries hosted on github releases from eugeneware/ffmpeg-static
// in development mode, uses locally installed ffmpeg-static/ffprobe-static

const path = require("path");
const fs = require("fs").promises;
const { createWriteStream, existsSync } = require("fs");
const https = require("https");
const { app } = require("electron");

// ffmpeg-static release version (contains both ffmpeg and ffprobe)
const FFMPEG_VERSION = "b6.0";

// check if running in development mode
const isDev = !app.isPackaged;

// try to get local ffmpeg-static path (for development)
function getLocalFFmpegPath() {
  try {
    const ffmpegPath = require("ffmpeg-static");
    if (ffmpegPath && existsSync(ffmpegPath)) {
      return ffmpegPath;
    }
  } catch (e) {
    // not available
  }
  return null;
}

// try to get local ffprobe-static path (for development)
function getLocalFFprobePath() {
  try {
    const ffprobeStatic = require("ffprobe-static");
    const ffprobePath =
      ffprobeStatic && typeof ffprobeStatic === "object" && ffprobeStatic.path
        ? ffprobeStatic.path
        : ffprobeStatic;
    if (ffprobePath && existsSync(ffprobePath)) {
      return ffprobePath;
    }
  } catch (e) {
    // not available
  }
  return null;
}

// base url for downloading binaries (both ffmpeg and ffprobe are in ffmpeg-static repo)
const RELEASE_BASE_URL = "https://github.com/eugeneware/ffmpeg-static/releases/download";

function getBinaryInfo() {
  const platform = process.platform;
  const arch = process.arch;

  let ffmpegFilename, ffprobeFilename;

  if (platform === "win32") {
    ffmpegFilename = "ffmpeg.exe";
    ffprobeFilename = "ffprobe.exe";
  } else if (platform === "darwin") {
    ffmpegFilename = "ffmpeg";
    ffprobeFilename = "ffprobe";
  } else {
    ffmpegFilename = "ffmpeg";
    ffprobeFilename = "ffprobe";
  }

  // map to github release naming
  let platformArch;
  if (platform === "win32" && arch === "x64") {
    platformArch = "win32-x64";
  } else if (platform === "win32" && arch === "ia32") {
    platformArch = "win32-ia32";
  } else if (platform === "darwin" && arch === "x64") {
    platformArch = "darwin-x64";
  } else if (platform === "darwin" && arch === "arm64") {
    platformArch = "darwin-arm64";
  } else if (platform === "linux" && arch === "x64") {
    platformArch = "linux-x64";
  } else if (platform === "linux" && arch === "arm64") {
    platformArch = "linux-arm64";
  } else {
    platformArch = `${platform}-${arch}`;
  }

  return {
    platform,
    arch,
    platformArch,
    ffmpegFilename,
    ffprobeFilename,
    ffmpegUrl: `${RELEASE_BASE_URL}/${FFMPEG_VERSION}/ffmpeg-${platformArch}`,
    ffprobeUrl: `${RELEASE_BASE_URL}/${FFMPEG_VERSION}/ffprobe-${platformArch}`,
  };
}

function getBinariesDir() {
  return path.join(app.getPath("userData"), "bin");
}

function getFFmpegPath() {
  // in dev mode, prefer local ffmpeg-static
  if (isDev) {
    const localPath = getLocalFFmpegPath();
    if (localPath) return localPath;
  }
  const info = getBinaryInfo();
  return path.join(getBinariesDir(), info.ffmpegFilename);
}

function getFFprobePath() {
  // in dev mode, prefer local ffprobe-static
  if (isDev) {
    const localPath = getLocalFFprobePath();
    if (localPath) return localPath;
  }
  const info = getBinaryInfo();
  return path.join(getBinariesDir(), info.ffprobeFilename);
}

async function downloadFile(url, destPath, onProgress) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    let redirectCount = 0;

    const doRequest = (requestUrl) => {
      https
        .get(requestUrl, (response) => {
          // handle redirects (github uses them)
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            redirectCount++;
            if (redirectCount > 5) {
              reject(new Error("Too many redirects"));
              return;
            }
            doRequest(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers["content-length"], 10);
          let downloadedSize = 0;

          response.on("data", (chunk) => {
            downloadedSize += chunk.length;
            if (onProgress && totalSize) {
              onProgress(downloadedSize, totalSize);
            }
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            resolve();
          });

          file.on("error", (err) => {
            fs.unlink(destPath).catch(() => {});
            reject(err);
          });
        })
        .on("error", (err) => {
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });
    };

    doRequest(url);
  });
}

async function setExecutable(filePath) {
  if (process.platform !== "win32") {
    await fs.chmod(filePath, 0o755);
  }
}

async function ensureBinariesExist(onProgress) {
  const binDir = getBinariesDir();
  const ffmpegPath = getFFmpegPath();
  const ffprobePath = getFFprobePath();

  const ffmpegExists = existsSync(ffmpegPath);
  const ffprobeExists = existsSync(ffprobePath);

  if (ffmpegExists && ffprobeExists) {
    return { ffmpegPath, ffprobePath, downloaded: false };
  }

  const info = getBinaryInfo();

  // download missing binaries
  if (!ffmpegExists) {
    console.log(`Downloading ffmpeg for ${info.platformArch}...`);
    await downloadFile(info.ffmpegUrl, ffmpegPath, (downloaded, total) => {
      if (onProgress) {
        onProgress("ffmpeg", downloaded, total);
      }
    });
    await setExecutable(ffmpegPath);
    console.log("ffmpeg downloaded successfully");
  }

  if (!ffprobeExists) {
    console.log(`Downloading ffprobe for ${info.platformArch}...`);
    await downloadFile(info.ffprobeUrl, ffprobePath, (downloaded, total) => {
      if (onProgress) {
        onProgress("ffprobe", downloaded, total);
      }
    });
    await setExecutable(ffprobePath);
    console.log("ffprobe downloaded successfully");
  }

  return { ffmpegPath, ffprobePath, downloaded: true };
}

function areBinariesAvailable() {
  // in dev mode, check for local binaries first
  if (isDev) {
    const localFFmpeg = getLocalFFmpegPath();
    const localFFprobe = getLocalFFprobePath();
    if (localFFmpeg && localFFprobe) return true;
  }
  // check downloaded binaries
  const ffmpegPath = path.join(getBinariesDir(), getBinaryInfo().ffmpegFilename);
  const ffprobePath = path.join(getBinariesDir(), getBinaryInfo().ffprobeFilename);
  return existsSync(ffmpegPath) && existsSync(ffprobePath);
}

module.exports = {
  getBinariesDir,
  getFFmpegPath,
  getFFprobePath,
  ensureBinariesExist,
  areBinariesAvailable,
  getBinaryInfo,
};
