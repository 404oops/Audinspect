// afterPack hook to compress ffmpeg/ffprobe binaries with UPX
// reduces binary size by ~50%

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

// upx npm package provides the upx binary path
let upxPath;
try {
  upxPath = require("upx")();
  // upx() returns a function, we need the actual path
  if (typeof upxPath === "function") {
    upxPath = null;
  }
} catch (e) {
  upxPath = null;
}

// fallback: try to find upx in node_modules
if (!upxPath) {
  const possiblePaths = [
    path.join(__dirname, "..", "node_modules", "upx", "bin", "upx.exe"),
    path.join(__dirname, "..", "node_modules", "upx", "bin", "upx"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      upxPath = p;
      break;
    }
  }
}

async function compressBinary(binaryPath, upx) {
  if (!fs.existsSync(binaryPath)) {
    console.log(`  skipping (not found): ${binaryPath}`);
    return false;
  }

  const statBefore = fs.statSync(binaryPath);
  const sizeBefore = statBefore.size;

  try {
    // use -9 for best compression, --force to overwrite
    execSync(`"${upx}" -9 --force "${binaryPath}"`, {
      stdio: "pipe",
      timeout: 120000, // 2 minute timeout
    });

    const statAfter = fs.statSync(binaryPath);
    const sizeAfter = statAfter.size;
    const saved = sizeBefore - sizeAfter;
    const percent = ((saved / sizeBefore) * 100).toFixed(1);

    console.log(
      `  compressed: ${path.basename(binaryPath)} (${(sizeBefore / 1024 / 1024).toFixed(1)}MB -> ${(sizeAfter / 1024 / 1024).toFixed(1)}MB, saved ${percent}%)`
    );
    return true;
  } catch (e) {
    console.warn(`  failed to compress ${path.basename(binaryPath)}: ${e.message}`);
    return false;
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;

  // only compress on windows for now (upx works best there)
  if (electronPlatformName !== "win32") {
    console.log("UPX compression: skipping (non-windows platform)");
    return;
  }

  if (!upxPath || !fs.existsSync(upxPath)) {
    console.warn("UPX compression: skipping (upx binary not found)");
    return;
  }

  console.log("UPX compression: compressing ffmpeg/ffprobe binaries...");

  const resourcesDir = path.join(appOutDir, "resources", "app.asar.unpacked", "node_modules");

  // ffmpeg binary
  const ffmpegPath = path.join(resourcesDir, "ffmpeg-static", "ffmpeg.exe");

  // ffprobe binary (x64 only since we exclude ia32)
  const ffprobePath = path.join(resourcesDir, "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");

  let compressed = 0;
  if (await compressBinary(ffmpegPath, upxPath)) compressed++;
  if (await compressBinary(ffprobePath, upxPath)) compressed++;

  console.log(`UPX compression: done (${compressed} binaries compressed)`);
};
