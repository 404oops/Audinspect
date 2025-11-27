const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "../build");

if (!fs.existsSync(buildDir)) {
  console.log("Build directory does not exist, skipping cleanup.");
  process.exit(0);
}

console.log("Cleaning up build directory...");

try {
  const files = fs.readdirSync(buildDir);

  files.forEach((file) => {
    const filePath = path.join(buildDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (
        file.includes("unpacked") ||
        file === "mac" ||
        file === "win-ia32-unpacked" ||
        file === "linux-ia32-unpacked"
      ) {
        console.log(`Removing directory: ${file}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      }

      if (
        [
          "mac",
          "mac-arm64",
          "win-unpacked",
          "win-arm64-unpacked",
          "linux-unpacked",
        ].includes(file)
      ) {
        console.log(`Removing directory: ${file}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      }

      if (file.includes("icon")) {
        console.log(`Removing directory: ${file}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    } else {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        console.log(`Removing file: ${file}`);
        fs.unlinkSync(filePath);
      }

      if (file.endsWith(".blockmap")) {
        console.log(`Removing file: ${file}`);
        fs.unlinkSync(filePath);
      }
    }
  });

  console.log("Cleanup complete.");
} catch (err) {
  console.error("Error during cleanup:", err);
  process.exit(1);
}
