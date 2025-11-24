const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '../build');

if (!fs.existsSync(buildDir)) {
  console.log('Build directory does not exist, skipping cleanup.');
  process.exit(0);
}

console.log('Cleaning up build directory...');

try {
  const files = fs.readdirSync(buildDir);

  files.forEach(file => {
    const filePath = path.join(buildDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Remove unpacked directories (e.g., mac, win-unpacked, linux-unpacked)
      if (file.includes('unpacked') || file === 'mac' || file === 'win-ia32-unpacked' || file === 'linux-ia32-unpacked') {
        console.log(`Removing directory: ${file}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
      // Also remove platform specific folders if they are just unpacked intermediates
      // electron-builder often leaves 'mac', 'mac-arm64', 'win-unpacked', etc.
      // We'll be aggressive: if it's a directory and not a .app (which is a directory on mac but we might want to keep it? usually users want the DMG/Zip)
      // Actually, .app is usually inside mac/ folder. The root build/ folder usually has installers.
      // Let's stick to removing known unpacked folders.
      if (['mac', 'mac-arm64', 'win-unpacked', 'win-arm64-unpacked', 'linux-unpacked'].includes(file)) {
        console.log(`Removing directory: ${file}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      }

      if (file.includes('icon')) {
        console.log(`Removing directory: ${file}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    } else {
      // Remove YAML/YML config files
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        console.log(`Removing file: ${file}`);
        fs.unlinkSync(filePath);
      }
      // Remove blockmap files (used for auto-update, often not needed if not using electron-updater)
      if (file.endsWith('.blockmap')) {
        console.log(`Removing file: ${file}`);
        fs.unlinkSync(filePath);
      }
    }
  });

  console.log('Cleanup complete.');
} catch (err) {
  console.error('Error during cleanup:', err);
  process.exit(1);
}
