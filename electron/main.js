const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, nativeImage } = require('electron');
const { webUtils } = require('electron');
const path = require('node:path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { Level } = require('level');

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
  const isMac = process.platform === 'darwin';
  
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    // On macOS, use hiddenInset to get native traffic light buttons
    ...(isMac && {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 7 },
    }),
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });



  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Track fullscreen state for macOS traffic light spacer
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-change', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-change', false);
  });

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

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled) return null;
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] },
    ],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return [];
  return result.filePaths;
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

ipcMain.handle('file:processFromBytes', async (_event, fileName, fileBytes) => {
  try {
    const ext = path.extname(fileName).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      console.warn(`Unsupported file extension: ${ext}`);
      return null;
    }

    const tempDir = require('os').tmpdir();
    const tempPath = path.join(tempDir, `audinspect_${Date.now()}_${fileName}`);

    await fs.writeFile(tempPath, Buffer.from(fileBytes));

    const st = await fs.stat(tempPath);
    if (st.isFile()) {
      return tempPath;
    }

    await fs.unlink(tempPath).catch(() => {});
    return null;
  } catch (err) {
    console.error('Failed to process file from bytes:', err);
    return null;
  }
});

ipcMain.handle('file:getPath', async (_event, fileRef) => {
  try {
    const filePath = webUtils.getPathForFile(fileRef);
    return filePath;
  } catch (err) {
    console.error('Failed to get file path:', err);
    return null;
  }
});

ipcMain.handle('files:scanPaths', async (_event, paths) => {
  if (!paths || !Array.isArray(paths)) return [];
  const normalizedPaths = paths
    .filter((raw) => {
      if (!raw || typeof raw !== 'string') {
        console.warn(`Invalid path value received in files:scanPaths:`, raw);
        return false;
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        console.warn(`Empty/whitespace-only path received in files:scanPaths`);
        return false;
      }
      return true;
    })
    .map((p) => p.trim());

  if (!normalizedPaths.length) {
    return [];
  }

  let allResults = [];
  try {
    for (const p of normalizedPaths) {
      try {
        const st = await fs.stat(p);
        if (st.isDirectory()) {
          const nested = await collectAudioFiles(p);
          allResults = allResults.concat(nested);
        } else if (st.isFile()) {
          const ext = path.extname(p).toLowerCase();
          if (AUDIO_EXTENSIONS.has(ext)) {
            allResults.push(p);
          }
        }
      } catch (e) {
        console.warn(`Failed to stat path ${p}:`, e);
      }
    }

    return [...new Set(allResults)];
  } catch (err) {
    console.error('Error scanning paths:', err);
    return [];
  }
});

ipcMain.handle('files:getMetadata', async (_event, paths) => {
  if (!paths || !Array.isArray(paths)) return [];
  const uniquePaths = [...new Set(paths.filter((p) => typeof p === 'string' && p.trim()))];
  if (!uniquePaths.length) return [];

  const results = [];
  for (const p of uniquePaths) {
    try {
      const st = await fs.stat(p);
      const ext = path.extname(p).toLowerCase();
      results.push({
        path: p,
        size: st.size,
        mtimeMs: st.mtimeMs,
        mtimeIso: st.mtime.toISOString(),
        type: ext || null,
      });
    } catch (e) {
      console.warn('Failed to stat for metadata:', p, e);
      results.push({ path: p });
    }
  }

  return results;
});

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

ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});


ipcMain.handle('file:decodeToWav', async (_event, filePath) => {
  if (!filePath) return null;


  let ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');

    console.log('FFmpeg path from require:', ffmpegPath);
    console.log('App is packaged:', app.isPackaged);
    console.log('Process resources path:', process.resourcesPath);


    if (app.isPackaged) {
      if (ffmpegPath && ffmpegPath.includes('app.asar')) {

        ffmpegPath = ffmpegPath.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
        console.log('Replaced app.asar with app.asar.unpacked:', ffmpegPath);
      } else if (!ffmpegPath) {

        const platform = process.platform;
        const ext = platform === 'win32' ? '.exe' : '';
        const binaryName = `ffmpeg${ext}`;

        const resourcesPath = process.resourcesPath;
        ffmpegPath = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', binaryName);
        console.log('Manually constructed FFmpeg path:', ffmpegPath);
      }
    }

    if (!ffmpegPath) throw new Error('ffmpeg-static returned null path and could not construct fallback');

    console.log('Final FFmpeg path:', ffmpegPath);
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

let cachedFfprobePath = null;
let metadataDb = null;

function getFfprobePath() {
  if (cachedFfprobePath) return cachedFfprobePath;

  const ffprobeStatic = require('ffprobe-static');
  let ffprobePath =
    ffprobeStatic && typeof ffprobeStatic === 'object' && ffprobeStatic.path
      ? ffprobeStatic.path
      : ffprobeStatic;

  if (app.isPackaged) {
    if (ffprobePath && ffprobePath.includes('app.asar')) {
      ffprobePath = ffprobePath.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
    } else if (!ffprobePath) {
      const platform = process.platform;
      const ext = platform === 'win32' ? '.exe' : '';
      const binaryName = `ffprobe${ext}`;
      const resourcesPath = process.resourcesPath;
      ffprobePath = path.join(
        resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'ffprobe-static',
        binaryName,
      );
    }
  }

  if (!ffprobePath) throw new Error('ffprobe-static returned null path and could not construct fallback');

  cachedFfprobePath = ffprobePath;
  return ffprobePath;
}

function getMetadataDb() {
  if (metadataDb) return metadataDb;
  const userDataDir = app.getPath('userData');
  const dbPath = path.join(userDataDir, 'audinspect-metadata');
  metadataDb = new Level(dbPath, { valueEncoding: 'json' });
  return metadataDb;
}

async function upsertTrackMetadata(data) {
  if (!data || !data.path) return;
  const db = getMetadataDb();
  const now = Date.now();
  let existing = null;
  try {
    existing = await db.get(data.path);
  } catch (e) {
  }

  const record = {
    path: data.path,
    size: typeof data.size === 'number' ? data.size : (existing && typeof existing.size === 'number' ? existing.size : null),
    mtimeMs: typeof data.mtimeMs === 'number' ? data.mtimeMs : (existing && typeof existing.mtimeMs === 'number' ? existing.mtimeMs : null),
    type: data.type || (existing && existing.type ? existing.type : null),
    duration: typeof data.duration === 'number' ? data.duration : (existing && typeof existing.duration === 'number' ? existing.duration : null),
    createdAt: existing && typeof existing.createdAt === 'number' ? existing.createdAt : now,
    updatedAt: now,
  };

  try {
    await db.put(data.path, record);
  } catch (e) {
  }
}

async function getCachedTrackMetadata(trackPath) {
  if (!trackPath) return null;
  const db = getMetadataDb();
  try {
    const row = await db.get(trackPath);
    return row || null;
  } catch (e) {
    return null;
  }
}

function runFfprobeDuration(ffprobePath, filePath) {
  return new Promise((resolve) => {
    try {
      const args = [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ];

      const ff = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let errBuf = '';

      ff.stdout.on('data', (c) => {
        out += c.toString();
      });
      ff.stderr.on('data', (d) => {
        errBuf += d.toString();
      });

      ff.on('close', (code) => {
        if (code === 0) {
          const text = (out || '').trim().split(/\r?\n/).pop();
          const dur = parseFloat(text);
          if (!Number.isFinite(dur) || dur <= 0) {
            resolve({ duration: null, error: `ffprobe returned invalid duration: ${text}`, code: 0 });
          } else {
            resolve({ duration: dur, error: null, code: 0 });
          }
        } else {
          console.error('ffprobe failed:', code, errBuf);
          resolve({ duration: null, error: `ffprobe failed (code ${code}): ${errBuf}`, code });
        }
      });

      ff.on('error', (e) => {
        console.error('ffprobe spawn error:', e);
        resolve({ duration: null, error: `ffprobe spawn error: ${e.message}`, code: null });
      });
    } catch (e) {
      console.error('Error running ffprobe:', e);
      resolve({ duration: null, error: `Error running ffprobe: ${e.message}`, code: null });
    }
  });
}

ipcMain.handle('file:probeDuration', async (_event, filePath) => {
  if (!filePath) return null;

  let ffprobePath;
  try {
    ffprobePath = getFfprobePath();
  } catch (e) {
    console.error('Failed to resolve ffprobe-static path:', e);
    return { duration: null, error: `Failed to resolve ffprobe path: ${e.message}`, code: null };
  }

  return runFfprobeDuration(ffprobePath, filePath);
});

ipcMain.handle('files:probeDurations', async (event, paths) => {
  if (!paths || !Array.isArray(paths)) return [];
  const uniquePaths = [...new Set(paths.filter((p) => typeof p === 'string' && p.trim()))];
  if (!uniquePaths.length) return [];

  let ffprobePath;
  try {
    ffprobePath = getFfprobePath();
  } catch (e) {
    console.error('Failed to resolve ffprobe-static path in files:probeDurations:', e);
    return [];
  }

  const results = [];
  for (const p of uniquePaths) {
    let size = null;
    let mtimeMs = null;
    let type = null;
    try {
      const st = await fs.stat(p);
      size = typeof st.size === 'number' ? st.size : null;
      mtimeMs = typeof st.mtimeMs === 'number' ? st.mtimeMs : null;
      const ext = path.extname(p).toLowerCase();
      type = ext || null;
    } catch (e) {
    }

    let res;
    let usedCache = false;
    if (size != null && mtimeMs != null) {
      try {
        const cached = await getCachedTrackMetadata(p);
        if (
          cached &&
          typeof cached.duration === 'number' &&
          Number.isFinite(cached.duration) &&
          cached.duration > 0 &&
          (typeof cached.size !== 'number' || cached.size === size) &&
          (typeof cached.mtimeMs !== 'number' || cached.mtimeMs === mtimeMs)
        ) {
          res = { duration: cached.duration, error: null, code: 0 };
          usedCache = true;
        }
      } catch (e) {
      }
    }

    if (!res) {
      res = await runFfprobeDuration(ffprobePath, p);
    }

    results.push({ path: p, ...res });

    try {
      if (res && typeof res.duration === 'number' && Number.isFinite(res.duration) && res.duration > 0) {
        event.sender.send('files:probeDurations:progress', { path: p, duration: res.duration });
      } else if (res && res.error) {
        event.sender.send('files:probeDurations:progress', { path: p, duration: null, error: res.error });
      }
    } catch (e) {
    }

    if (!usedCache && res && typeof res.duration === 'number' && Number.isFinite(res.duration) && res.duration > 0) {
      try {
        await upsertTrackMetadata({
          path: p,
          size,
          mtimeMs,
          type,
          duration: res.duration,
        });
      } catch (e) {
      }
    }
  }

  return results;
});

app.whenReady().then(() => {
  const mainWindow = createWindow();

  const playbackState = { isPlaying: false };

  const sendMediaCommand = (channel) => {
    try {
      const win = BrowserWindow.getAllWindows().find((w) => w && !w.isDestroyed());
      if (win) {
        win.webContents.send(channel);
      }
    } catch (e) {
      console.warn('Failed to send media command to renderer:', e);
    }
  };

  const updateThumbarButtons = (win, isPlaying) => {
    if (!win || win.isDestroyed() || process.platform !== 'win32') return;
    try {
      const resourcesDir = path.join(__dirname, '../resources');
      const appIcon = nativeImage.createFromPath(path.join(resourcesDir, 'icon.png'));

      const prevIconRaw = nativeImage.createFromPath(path.join(resourcesDir, 'skip-back.png'));
      const nextIconRaw = nativeImage.createFromPath(path.join(resourcesDir, 'skip-forward.png'));
      const playIconRaw = nativeImage.createFromPath(path.join(resourcesDir, 'play.png'));
      const pauseIconRaw = nativeImage.createFromPath(path.join(resourcesDir, 'pause.png'));

      const prevIcon = prevIconRaw && !prevIconRaw.isEmpty() ? prevIconRaw : appIcon;
      const nextIcon = nextIconRaw && !nextIconRaw.isEmpty() ? nextIconRaw : appIcon;
      const playIcon = playIconRaw && !playIconRaw.isEmpty() ? playIconRaw : appIcon;
      const pauseIcon = pauseIconRaw && !pauseIconRaw.isEmpty() ? pauseIconRaw : appIcon;

      const playPauseIcon = isPlaying ? pauseIcon : playIcon;

      win.setThumbarButtons([
        {
          tooltip: 'previous',
          icon: prevIcon,
          click: () => sendMediaCommand('media:previous'),
        },
        {
          tooltip: isPlaying ? 'pause' : 'play',
          icon: playPauseIcon,
          click: () => sendMediaCommand('media:playPause'),
        },
        {
          tooltip: 'next',
          icon: nextIcon,
          click: () => sendMediaCommand('media:next'),
        },
      ]);
    } catch (e) {
      console.warn('Failed to update thumbar buttons:', e);
    }
  };

  ipcMain.handle('player:updatePlaybackState', (_event, isPlaying) => {
    try {
      playbackState.isPlaying = !!isPlaying;
      const win = BrowserWindow.getAllWindows().find((w) => w && !w.isDestroyed());
      if (win) updateThumbarButtons(win, playbackState.isPlaying);
    } catch (e) {
      console.warn('Failed to handle player:updatePlaybackState:', e);
    }
    return null;
  });

  try {
    globalShortcut.register('MediaPlayPause', () => {
      sendMediaCommand('media:playPause');
    });
    globalShortcut.register('MediaNextTrack', () => {
      sendMediaCommand('media:next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      sendMediaCommand('media:previous');
    });
  } catch (e) {
    console.warn('Failed to register media key shortcuts:', e);
  }

  updateThumbarButtons(mainWindow, playbackState.isPlaying);

  const template = [

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

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

