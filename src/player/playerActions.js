import { getVisibleRows } from "../utils/playlistSort";
import platform from "../platform";
import { collectDroppedFiles } from "../platform/virtualFiles";
import { settingsStorage } from "../platform/settingsStorage";
import { createWaveSurfer } from "./createWaveSurfer";
import { loadTrack } from "./loadTrack";

const basename = (p) => (p || "").split(/[\/\\]/).pop();

// everything the player can do, as plain functions over a set of refs and
// the zustand store. created once per AudioPlayer mount, so the returned
// object is stable and safe to hand to effects and children.
export function createPlayerActions({ refs, store }) {
  const {
    containerRef,
    wsRef,
    hoverPluginRef,
    loadTokenRef,
    currentLoadRef,
    isScrubbingRef,
    isPlayingRef,
    durationsRef,
    ffprobeAttemptsRef,
    originalNamesRef,
    timeDisplayRef,
    hasFolderWatchRef,
    osOpenHandledRef,
    playerAreaRef,
    playlistAreaRef,
  } = refs;

  const S = () => store.getState();
  const api = () => platform;

  const setPlaying = (playing) => {
    isPlayingRef.current = playing;
    S().setIsPlaying(playing);
  };

  const getDisplayName = (filePath) =>
    originalNamesRef.current[filePath] || basename(filePath);

  const rememberNames = (entries) => {
    entries.forEach((f) => {
      if (f.path && f.name) originalNamesRef.current[f.path] = f.name;
    });
  };

  const visibleRows = (listOverride) => {
    const state = S();
    const base = Array.isArray(listOverride) ? listOverride : state.files;
    return getVisibleRows(base, state, getDisplayName);
  };

  // ---- wavesurfer lifecycle ------------------------------------------------

  const ensurePlayer = () => {
    if (wsRef.current) return wsRef.current;
    const { ws, hoverPlugin } = createWaveSurfer({
      container: containerRef.current,
      timeDisplayRef,
      onPlayingChange: setPlaying,
    });
    wsRef.current = ws;
    hoverPluginRef.current = hoverPlugin;
    return ws;
  };

  const cleanupCurrentLoad = () => {
    const cur = currentLoadRef.current;
    if (cur && typeof cur.cleanup === "function") {
      try {
        cur.cleanup();
      } catch (e) { }
      cur.cleanup = null;
      cur.url = null;
    }
  };

  const destroyPlayer = () => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      ws.pause && ws.pause();
    } catch (e) { }
    try {
      ws.destroy();
    } catch (e) { }
    wsRef.current = null;
    hoverPluginRef.current = null;
  };

  // unmount: release the load, the instance and the folder watcher
  const abandonInFlightLoad = () => {
    loadTokenRef.current += 1;
  };

  const teardown = () => {
    abandonInFlightLoad();
    cleanupCurrentLoad();
    destroyPlayer();
    if (api() && typeof api().unwatchFolder === "function") {
      try {
        api().unwatchFolder();
      } catch (e) { }
    }
    hasFolderWatchRef.current = false;
  };

  // ---- playlist state ------------------------------------------------------

  // drops every loaded file and tears down the current wavesurfer instance
  function resetPlaylistState() {
    const s = S();
    abandonInFlightLoad();
    s.setFiles([]);
    s.setCurrentIndex(-1);
    s.setSelectedIndex(-1);
    setPlaying(false);
    s.setIsLoaded(false);
    s.setDuration(0);
    s.setTime(0);
    s.setFolderTree(null);
    s.setDurations({});
    durationsRef.current = {};
    s.setFileMetadata({});
    cleanupCurrentLoad();
    destroyPlayer();
  }

  async function watchFolder(folder) {
    if (api() && typeof api().watchFolder === "function") {
      try {
        await api().watchFolder(folder);
        hasFolderWatchRef.current = true;
      } catch (e) {
        hasFolderWatchRef.current = false;
      }
    } else {
      hasFolderWatchRef.current = false;
    }
  }

  async function leaveFolderMode() {
    if (
      (hasFolderWatchRef.current || S().currentFolderPath) &&
      api() &&
      typeof api().unwatchFolder === "function"
    ) {
      try {
        await api().unwatchFolder();
      } catch (e) { }
    }
    hasFolderWatchRef.current = false;
    S().setCurrentFolderPath(null);
    try {
      settingsStorage.removeItem("lastOpenedFolder");
    } catch (e) { }
  }

  async function closeFolder() {
    await leaveFolderMode();
    resetPlaylistState();
  }

  function clearPlaylist() {
    resetPlaylistState();
  }

  // date sorting needs mtimes before the first render of a fresh list
  async function preloadMetadataForInitialSort(paths) {
    if (!api() || typeof api().getFileMetadata !== "function") return;
    const mode = S().sortMode;
    if (mode !== "date" && mode !== "dateOldest") return;
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    if (!uniquePaths.length) return;
    try {
      const result = await api().getFileMetadata(uniquePaths);
      const map = {};
      (result || []).forEach((item) => {
        if (item && item.path) map[item.path] = item;
      });
      S().setFileMetadata(map);
    } catch (e) { }
  }

  // ---- opening things ------------------------------------------------------

  async function openFolderPath(folder, { remember }) {
    const list = await api().readAudioFiles(folder);
    S().setCurrentFolderPath(folder || null);
    await watchFolder(folder);
    await preloadMetadataForInitialSort(list);
    S().setFiles(list || []);
    if (remember && settingsStorage.getItem("rememberLastFolder") === "true") {
      settingsStorage.setItem("lastOpenedFolder", folder);
    }
    return list || [];
  }

  async function handleOpenFolder() {
    const folder = await api().openFolder();
    if (!folder) return;

    await leaveFolderMode();
    resetPlaylistState();

    const list = await openFolderPath(folder, { remember: true });
    if (!list.length) {
      S().showToast("no supported audio files found in selected folder");
      return;
    }
    const rows = visibleRows(list);
    if (rows.length) {
      loadAtIndex(rows[0].idx, list, { autoPlay: false });
    }
  }

  // "open to last folder on startup"; skipped when the os handed us a file
  async function loadLastFolder() {
    const rememberLastFolder = settingsStorage.getItem("rememberLastFolder");
    const lastFolder = settingsStorage.getItem("lastOpenedFolder");

    if (osOpenHandledRef.current) return;
    if (rememberLastFolder !== "true" || !lastFolder || !api()) return;
    try {
      const list = await api().readAudioFiles(lastFolder);
      if (osOpenHandledRef.current) return;
      if (list && list.length > 0) {
        await preloadMetadataForInitialSort(list);
        if (osOpenHandledRef.current) return;
        S().setCurrentFolderPath(lastFolder);
        await watchFolder(lastFolder);
        if (osOpenHandledRef.current) return;
        S().setFiles(list);
        const rows = visibleRows(list);
        if (rows.length) {
          loadAtIndex(rows[0].idx, list, { autoPlay: false });
        }
      }
    } catch (err) {
      console.warn("Failed to load last folder:", err);
      settingsStorage.removeItem("lastOpenedFolder");
    }
  }

  async function handleOpenFile() {
    if (!api() || typeof api().openFiles !== "function") return;
    let selected;
    try {
      selected = await api().openFiles();
    } catch (e) {
      return;
    }
    if (!selected || !selected.length) return;
    await openPaths(selected, { play: false });
  }

  // entry point for everything that hands us paths: the open-files dialog,
  // the application menu and files opened through the os. folders expand to
  // the audio files inside them.
  async function openPaths(rawPaths, options = {}) {
    const { play = false, fromOs = false } = options;
    const input = (rawPaths || []).filter(
      (p) => typeof p === "string" && p.trim()
    );
    if (!input.length || !api()) return;
    if (fromOs) {
      osOpenHandledRef.current = true;
      console.info("opened via puter:", input);
    }

    let expanded;
    try {
      expanded = await api().expandPaths(input);
    } catch (e) {
      expanded = { files: [], unsupported: input.length };
    }
    const paths = Array.isArray(expanded && expanded.files)
      ? expanded.files
      : [];
    const unsupported = (expanded && expanded.unsupported) || 0;
    if (unsupported) {
      S().showToast(
        `${unsupported} unsupported file${unsupported > 1 ? "s" : ""} skipped`
      );
    }
    if (!paths.length) {
      if (fromOs) {
        osOpenHandledRef.current = false;
        const s = S();
        if (!(s.files || []).length && !s.currentFolderPath) loadLastFolder();
      }
      return;
    }

    const state = S();
    if (state.currentFolderPath) {
      // a file from the folder that's already open: just select it
      if (paths.length === 1) {
        const idx = (state.files || []).indexOf(paths[0]);
        if (idx >= 0) {
          loadAtIndex(idx, state.files, { autoPlay: true });
          return;
        }
      }
      await leaveFolderMode();
      resetPlaylistState();
      S().setFiles(paths);
      loadAtIndex(0, paths, { autoPlay: true });
      return;
    }

    appendFilesToPlaylist(
      paths.map((p) => ({ path: p })),
      { autoPlayIfEmpty: true, playFirst: play, selectIfIdle: true }
    );
  }

  // ---- loading + transport -------------------------------------------------

  async function loadAtIndex(index, fromList, options = {}) {
    const { autoPlay = true } = options;
    const list = fromList || S().files;
    if (!list || index < 0 || index >= list.length) return;
    const filePath = list[index];
    S().setCurrentIndex(index);
    S().setSelectedIndex(index);

    const token = ++loadTokenRef.current;
    cleanupCurrentLoad();

    if (wsRef.current) {
      try {
        wsRef.current.pause && wsRef.current.pause();
      } catch (e) { }
      try {
        wsRef.current.empty && wsRef.current.empty();
      } catch (e) { }
    } else {
      ensurePlayer();
    }

    const s = S();
    s.setIsLoaded(false);
    s.setTime(0);
    s.setDuration(0);
    setPlaying(false);

    await loadTrack({
      filePath,
      token,
      autoPlay,
      refs: { wsRef, loadTokenRef, currentLoadRef, durationsRef },
      setPlaying,
    });
  }

  function hop(direction) {
    const ws = wsRef.current;
    if (!ws) return;
    const { time, duration, nudgeAmount } = S();
    const t = ws.getCurrentTime ? ws.getCurrentTime() : time || 0;
    const dur = ws.getDuration ? ws.getDuration() : duration || 0;
    let nt = t + direction * nudgeAmount;
    if (nt < 0) nt = 0;
    if (dur && nt > dur) nt = dur;
    if (dur && ws.seekTo) ws.seekTo(nt / dur);
    else if (ws.setCurrentTime) ws.setCurrentTime(nt);
  }

  function togglePlay() {
    if (!wsRef.current) return;
    if (!S().isLoaded) return;
    wsRef.current.playPause();
    setPlaying(wsRef.current.isPlaying());
  }

  function next() {
    const rows = visibleRows();
    if (!rows.length) return;
    const { currentIndex } = S();
    const pos = rows.findIndex((row) => row.idx === currentIndex);
    if (pos < 0) {
      loadAtIndex(rows[0].idx);
      return;
    }
    if (pos + 1 < rows.length) {
      loadAtIndex(rows[pos + 1].idx);
    }
  }

  function prev() {
    const rows = visibleRows();
    if (!rows.length) return;
    const { currentIndex } = S();
    const pos = rows.findIndex((row) => row.idx === currentIndex);
    if (pos < 0) {
      loadAtIndex(rows[rows.length - 1].idx);
      return;
    }
    if (pos - 1 >= 0) {
      loadAtIndex(rows[pos - 1].idx);
    }
  }

  function seekToSeconds(seconds) {
    const ws = wsRef.current;
    if (!ws) return;
    const dur = ws.getDuration ? ws.getDuration() : S().duration;
    if (!dur) return;
    const nt = Math.max(0, Math.min(dur, seconds));
    if (ws.seekTo) ws.seekTo(nt / dur);
  }

  function seekTo(evt) {
    if (!wsRef.current) return;
    const { duration } = S();
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = evt.clientX - rect.left;
    wsRef.current.seekTo(x / rect.width);
  }

  const handleWaveMouseDown = (evt) => {
    if (!wsRef.current || !S().duration) return;
    isScrubbingRef.current = true;
    seekTo(evt);
  };
  const handleWaveMouseMove = (evt) => {
    if (!isScrubbingRef.current) return;
    seekTo(evt);
  };
  const handleWaveMouseUp = () => {
    isScrubbingRef.current = false;
  };
  const handleWaveMouseLeave = () => {
    isScrubbingRef.current = false;
  };

  // ---- playlist edits ------------------------------------------------------

  // adds entries ({ path, name? }) to the playlist, skipping ones already in
  // it. plays the first entry when the playlist was empty (autoPlayIfEmpty)
  // or when asked to (playFirst, used for files opened through the os).
  function appendFilesToPlaylist(entries, options = {}) {
    const valid = (entries || []).filter((f) => f && f.path);
    if (!valid.length) return;
    rememberNames(valid);

    const base = Array.isArray(S().files) ? S().files : [];
    const wasEmpty = base.length === 0;
    const present = new Set(base);
    const nextFiles = [...base];
    valid.forEach((f) => {
      if (!present.has(f.path)) {
        present.add(f.path);
        nextFiles.push(f.path);
      }
    });
    const addedCount = nextFiles.length - base.length;
    const skipped = valid.length - addedCount;
    if (skipped > 0) {
      S().showToast(
        skipped === valid.length
          ? "already in playlist"
          : `${skipped} already in playlist, added ${addedCount}`
      );
    }

    if (addedCount > 0) S().setFiles(nextFiles);

    const firstIndex = nextFiles.indexOf(valid[0].path);
    if (firstIndex < 0) return;
    if (options.playFirst || (options.autoPlayIfEmpty && wasEmpty)) {
      loadAtIndex(firstIndex, nextFiles);
    } else if (options.selectIfIdle && !S().isPlaying) {
      // nothing is playing: show the first opened file without starting it
      loadAtIndex(firstIndex, nextFiles, { autoPlay: false });
    }
  }

  function replaceCurrentTrackWithFiles(entries) {
    const valid = (entries || []).filter((f) => f && f.path);
    if (!valid.length) return;
    rememberNames(valid);

    const { files, currentIndex } = S();
    const first = valid[0];
    const rest = valid.slice(1);
    const base = Array.isArray(files) ? [...files] : [];
    let indexToPlay = currentIndex;
    let nextFiles;

    if (!base.length || currentIndex < 0 || currentIndex >= base.length) {
      indexToPlay = base.length;
      nextFiles = [...base, ...valid.map((f) => f.path)];
    } else {
      base[currentIndex] = first.path;
      rest.forEach((f) => base.push(f.path));
      nextFiles = base;
    }

    S().setFiles(nextFiles);

    if (nextFiles.length) {
      if (indexToPlay == null || indexToPlay < 0 || indexToPlay >= nextFiles.length) {
        indexToPlay = 0;
      }
      loadAtIndex(indexToPlay, nextFiles);
    }
  }

  function handleDeleteTrack(idx) {
    const s = S();
    const { files, currentIndex, selectedIndex } = s;
    s.setFiles(files.filter((_x, i2) => i2 !== idx));
    if (idx === currentIndex) {
      s.setCurrentIndex(-1);
      if (wsRef.current) {
        try {
          wsRef.current.pause && wsRef.current.pause();
        } catch (e) { }
        wsRef.current.empty && wsRef.current.empty();
      }
      setPlaying(false);
      s.setIsLoaded(false);
      abandonInFlightLoad();
      cleanupCurrentLoad();
    } else if (idx < currentIndex) {
      // the playing track moved up one slot
      s.setCurrentIndex(currentIndex - 1);
    }
    if (idx === selectedIndex) {
      s.setSelectedIndex(-1);
    } else if (idx < selectedIndex) {
      s.setSelectedIndex(selectedIndex - 1);
    }
  }

  // ---- drag and drop -------------------------------------------------------

  const getDropTarget = (evt) => {
    const { clientX: x, clientY: y } = evt;
    const inside = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    if (inside(playerAreaRef.current)) return "player";
    if (inside(playlistAreaRef.current)) return "playlist";
    return null;
  };

  // puter drags carry no coordinates, only the element under the pointer
  const getDropTargetForElement = (el) => {
    if (!el || typeof el.nodeType !== "number") return null;
    if (playerAreaRef.current && playerAreaRef.current.contains(el)) return "player";
    if (playlistAreaRef.current && playlistAreaRef.current.contains(el)) return "playlist";
    return null;
  };

  // files dragged in from outside puter (host os, browser tab). they stay
  // in memory for the session; dropped folders are walked for audio files.
  async function resolveDroppedFiles(dataTransfer) {
    try {
      return await collectDroppedFiles(dataTransfer);
    } catch (err) {
      console.warn("Failed to read dropped files:", err);
      return { entries: [], unsupported: 0 };
    }
  }

  // items dragged out of the puter desktop; folders expand
  async function resolveDroppedPaths(paths) {
    try {
      const res = await api().expandPaths(paths);
      return {
        entries: (res && res.files ? res.files : []).map((p) => ({ path: p })),
        unsupported: (res && res.unsupported) || 0,
      };
    } catch (err) {
      console.warn("Failed to expand dropped paths:", err);
      return { entries: [], unsupported: (paths || []).length };
    }
  }

  function addDroppedEntries({ entries, unsupported }, target) {
    if (unsupported) {
      S().showToast(
        `${unsupported} unsupported file${unsupported > 1 ? "s" : ""} skipped`
      );
    }
    if (!entries.length) return;

    const { files } = S();
    if (target === "player" && files && files.length > 0) {
      S().setDropConfirm({ files: entries });
      return;
    }

    appendFilesToPlaylist(entries, { autoPlayIfEmpty: true });
  }

  // a folder view mirrors what's on disk, so nothing gets added to it
  function refuseDropInFolderMode() {
    if (!S().currentFolderPath) return false;
    S().showToast("close the folder (x next to its name) to add files");
    return true;
  }

  async function handleDroppedFiles(dataTransfer, target) {
    if (refuseDropInFolderMode()) return;
    addDroppedEntries(await resolveDroppedFiles(dataTransfer), target);
  }

  async function handleDroppedPaths(paths, target) {
    if (refuseDropInFolderMode()) return;
    addDroppedEntries(await resolveDroppedPaths(paths), target);
  }

  function confirmDropReplace() {
    const { dropConfirm, setDropConfirm } = S();
    if (dropConfirm && dropConfirm.files && dropConfirm.files.length) {
      replaceCurrentTrackWithFiles(dropConfirm.files);
    }
    setDropConfirm(null);
  }

  function confirmDropAdd() {
    const { dropConfirm, setDropConfirm } = S();
    if (dropConfirm && dropConfirm.files && dropConfirm.files.length) {
      appendFilesToPlaylist(dropConfirm.files, { autoPlayIfEmpty: true });
    }
    setDropConfirm(null);
  }

  function cancelDrop() {
    S().setDropConfirm(null);
  }

  return {
    getDisplayName,
    visibleRows,
    ensurePlayer,
    teardown,
    resetPlaylistState,
    closeFolder,
    clearPlaylist,
    handleOpenFolder,
    handleOpenFile,
    openPaths,
    loadLastFolder,
    loadAtIndex,
    hop,
    togglePlay,
    next,
    prev,
    seekTo,
    seekToSeconds,
    handleWaveMouseDown,
    handleWaveMouseMove,
    handleWaveMouseUp,
    handleWaveMouseLeave,
    appendFilesToPlaylist,
    replaceCurrentTrackWithFiles,
    handleDeleteTrack,
    getDropTarget,
    getDropTargetForElement,
    handleDroppedFiles,
    handleDroppedPaths,
    confirmDropReplace,
    confirmDropAdd,
    cancelDrop,
  };
}
