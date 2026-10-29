# Audinspect for Puter

An audio inspector. Made for quick viewing of audio files. This branch is the
[Puter](https://puter.com) port of the Electron app: the same React +
wavesurfer.js interface, running in the browser inside a Puter window and
talking to the Puter file system through [puter.js](https://docs.puter.com).

![](frontpage.png)

## Features

- Audio scrubbing
- Waveform view
- Quick audio file viewing
- Drag and drop (items from the Puter desktop, or files and folders from your computer)
- Sorting
- Searching
- Metadata viewing
- Volume control
- Speed control
- Interface customization (including waveform, accent color, etc), synced to your Puter account
- Opens audio files straight from the Puter desktop (double-click, "Open With…", `?file=` links)

## Who is this for?

This is for music producers, A&R Teams, labels, reviewers, and people who want to quickly inspect music.

## How it plays things

There is no FFmpeg. Everything is decoded in the browser:

1. Formats the browser plays on its own (mp3, wav, flac, ogg/opus in most browsers; aac/m4a in many) are handed straight to the player.
2. Everything else, and any native attempt that fails, is decoded by [mediabunny](https://mediabunny.dev) through WebCodecs (aac, mp3, opus, vorbis, flac, pcm inside mp4/m4a, webm/mkv, ogg, wav, flac, adts).
3. What mediabunny can't open goes to [@audio/decode](https://github.com/audiojs/decode), whose WebAssembly codecs cover aiff, wma, ac3, dts, amr, ape, wavpack, dsf/dff and more.

Decoded audio is handed to wavesurfer as PCM wav, the same way the desktop
app handed over FFmpeg's output. Settings → Audio shows which engine handles
which format in the current browser.

Track lengths for the playlist are read from container headers with ranged
reads (mediabunny), so a folder of long files doesn't have to be downloaded
to be listed. Formats without a cheap header read (wma, ape, …) show their
length once played.

## What Puter provides

| Desktop app                         | Puter app                                              |
| ----------------------------------- | ------------------------------------------------------ |
| Native file / folder dialogs        | `puter.ui.showOpenFilePicker` / `showDirectoryPicker`  |
| `fs.readdir` / `fs.stat` / `fs.readFile` | `puter.fs.readdir` (recursive) / `stat` / `read` (ranged) |
| chokidar folder watcher             | polling `readdir` while a folder is open               |
| Application menu + accelerators     | `puter.ui.setMenubar` + in-app Ctrl/Cmd+O, Shift+O, `,` |
| OS file associations                | `puter.ui.onLaunchedWithItems` + app file type associations |
| Drops from the file manager         | Puter's `drop` relay for desktop items; DataTransfer for outside files |
| localStorage settings               | localStorage mirrored to `puter.kv` (follows your account) |
| On-disk import cache with a size cap | none: outside files stay in memory for the session, the browser owns the metadata cache (IndexedDB) |

## Getting Started with Developing

```bash
npm install
npm run dev
```

The dev server runs the app as a plain web page (`puter.env === "web"`). puter.js
then asks you to sign in to Puter the first time a file is opened, and file
pickers open in a popup. Inside a Puter window (`puter.env === "app"`) none
of that is needed.

Build:

```bash
npm run build
```

## Publishing on Puter

```bash
npm run deploy -- <subdomain>
```

`scripts/deploy-puter.mjs` does the whole thing through the puter.js SDK:

1. uploads `dist/` to a new `~/Documents/Audinspect/v<version>-<timestamp>/` folder on your Puter drive,
2. serves that folder at `https://<subdomain>.puter.site` (creating the site or re-pointing it) and then removes the previous release folders,
3. creates the Puter **app** `audinspect` (or updates it) with that site as its index URL, `resources/icon.png` as the icon and every extension from `src/utils/audio-extensions.json` as a file type association, so audio files offer Audinspect under *Open With…*.

Without `PUTER_AUTH_TOKEN` in the environment it opens the browser to sign in.
`PUTER_APP_NAME` and `PUTER_APP_DIR` override the app name (names are global on
Puter) and the drive folder. `--dry-run` lists what would be uploaded.

The GitHub workflow runs the same script on every push to this branch when the
`PUTER_AUTH_TOKEN` and `PUTER_SUBDOMAIN` repository secrets are set; the
optional `PUTER_APP_NAME` and `PUTER_APP_DIR` repository *variables* are passed
through.

## License

GPL-3.0-only.
