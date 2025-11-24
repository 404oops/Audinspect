const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg']);

async function collectAudioFiles(dir) {
  let results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectAudioFiles(fullPath);
      results = results.concat(nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    // On macOS hide the titlebar but keep the traffic-light buttons visible
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In development, load from Vite dev server
  // In production (packaged), load from built files in `dist`
  // Use `app.isPackaged` which reliably indicates a packaged app.
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  return mainWindow;
}

async function openFolderAndSend(win) {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;
  const folder = result.filePaths[0];
  try {
    const files = await collectAudioFiles(folder);
    win.webContents.send('files:loaded', files);
  } catch (err) {
    console.error('Failed to collect audio files from folder:', err);
    win.webContents.send('files:loaded', []);
  }
}

// IPC handlers for folder selection and recursive audio file reading
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled) return null;
  return result.filePaths[0] || null;
});

ipcMain.handle('files:readAudio', async (_event, folderPath) => {
  if (!folderPath) return [];
  try {
    const files = await collectAudioFiles(folderPath);
    return files;
  } catch (err) {
    console.error('Error reading audio files:', err);
    return [];
  }
});

// Return immediate folder contents (non-recursive)
ipcMain.handle('files:list', async (_event, folderPath) => {
  if (!folderPath) return [];
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: path.join(folderPath, e.name),
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  } catch (err) {
    console.error('Error listing folder:', err);
    return [];
  }
});

// Recursively traverse folder and return a tree of files/directories
ipcMain.handle('files:traverse', async (_event, folderPath) => {
  if (!folderPath) return null;
  async function build(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = await build(fullPath);
        result.push({ name: entry.name, path: fullPath, type: 'directory', children });
      } else if (entry.isFile()) {
        try {
          const st = await fs.stat(fullPath);
          result.push({ name: entry.name, path: fullPath, type: 'file', size: st.size });
        } catch (e) {
          result.push({ name: entry.name, path: fullPath, type: 'file' });
        }
      }
    }
    return result;
  }

  try {
    const tree = await build(folderPath);
    return tree;
  } catch (err) {
    console.error('Error traversing folder:', err);
    return null;
  }
});

// Read a single file and return its Buffer contents
ipcMain.handle('file:read', async (_event, filePath) => {
  if (!filePath) return null;
  try {
    const data = await fs.readFile(filePath);
    return data;
  } catch (err) {
    console.error('Error reading file:', err);
    return null;
  }
});

// Use ffmpeg to transcode arbitrary audio files to WAV (streamed to stdout)
// Returns a Buffer containing WAV data. Uses ffmpeg-static for reliability.
ipcMain.handle('file:decodeToWav', async (_event, filePath) => {
  if (!filePath) return null;
  // Lazy load ffmpeg-static to avoid issues if not needed immediately
  // and to ensure it's available in the packaged app context if handled correctly
  let ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
    // In production, ffmpeg-static might point to a path in app.asar.unpacked
    // or similar. We trust the package to provide the correct path.
    if (!ffmpegPath) throw new Error('ffmpeg-static returned null path');
  } catch (e) {
    console.error('Failed to resolve ffmpeg-static path:', e);
    return { data: null, error: `Failed to resolve ffmpeg path: ${e.message}`, code: null };
  }

  return new Promise((resolve) => {
    try {
      const args = ['-i', filePath, '-f', 'wav', '-'];
      console.log(`Spawning ffmpeg: ${ffmpegPath} ${args.join(' ')}`);

      const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = [];
      ff.stdout.on('data', (c) => chunks.push(c));
      let errBuf = '';
      ff.stderr.on('data', (d) => { errBuf += d.toString(); });

      ff.on('close', (code) => {
        if (code === 0) {
          const out = Buffer.concat(chunks);
          resolve({ data: out, error: null, code: 0 });
        } else {
          console.error('ffmpeg failed:', code, errBuf);
          resolve({ data: null, error: `ffmpeg failed (code ${code}): ${errBuf}`, code });
        }
      });

      ff.on('error', (e) => {
        console.error('ffmpeg spawn error:', e);
        resolve({ data: null, error: `ffmpeg spawn error: ${e.message}`, code: null });
      });
    } catch (e) {
      console.error('Error running ffmpeg:', e);
      resolve({ data: null, error: `Error running ffmpeg: ${e.message}`, code: null });
    }
  });
});

app.whenReady().then(() => {
  const mainWindow = createWindow();

  // Build application menu with a File -> Open Folder item
  const template = [
    // App menu (macOS)
    ...(process.platform === 'darwin'
      ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await openFolderAndSend(mainWindow);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
