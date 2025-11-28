import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import Hover from "wavesurfer.js/dist/plugins/hover.esm.js";
import Toast from "./Toast";
import DropConfirmModal from "./DropConfirmModal";
import PlayerArea from "./PlayerArea";
import PlaylistArea from "./PlaylistArea";
import usePlayerStore from "../store/usePlayerStore";

export default function AudioPlayer() {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const loadTokenRef = useRef(0);

  const currentLoadRef = useRef({ url: null, cleanup: null });
  const wheelAccRef = useRef(0);
  const playerAreaRef = useRef(null);
  const playlistAreaRef = useRef(null);
  const isScrubbingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const durationsRef = useRef({});
  const ffprobeAttemptsRef = useRef({});
  const originalNamesRef = useRef({});
  const timeDisplayRef = useRef(null);
  const dragTimeoutRef = useRef(null);
  const hoverPluginRef = useRef(null);
  const hopFnRef = useRef(() => {});

  const {
    files,
    currentIndex,
    selectedIndex,
    isPlaying,
    isLoaded,
    searchQuery,
    sortMode,
    duration,
    time,
    volume,
    folderTree,
    currentFolderPath,
    durations,
    fileMetadata,
    toast,
    dropConfirm,
    isDragging,
    dragTarget,
    setFiles,
    setCurrentIndex,
    setSelectedIndex,
    setIsPlaying,
    setIsLoaded,
    setSearchQuery,
    setSortMode,
    setDuration,
    setTime,
    setVolume,
    setFolderTree,
    setCurrentFolderPath,
    setDurations,
    setFileMetadata,
    setDropConfirm,
    setIsDragging,
    setDragTarget,
    showToast,
    hideToast,
    nudgeAmount,
    playbackSpeed,
    wavesurferTheme,
    wavesurferShowHover,
  } = usePlayerStore();

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribes = [];

    if (typeof window.electronAPI.onMediaPlayPause === "function") {
      unsubscribes.push(
        window.electronAPI.onMediaPlayPause(() => {
          togglePlay();
        })
      );
    }

    if (typeof window.electronAPI.onMediaNext === "function") {
      unsubscribes.push(
        window.electronAPI.onMediaNext(() => {
          next();
        })
      );
    }

    if (typeof window.electronAPI.onMediaPrevious === "function") {
      unsubscribes.push(
        window.electronAPI.onMediaPrevious(() => {
          prev();
        })
      );
    }

    return () => {
      unsubscribes.forEach((fn) => {
        if (typeof fn === "function") {
          try {
            fn();
          } catch (e) {}
        }
      });
    };
  }, [files, currentIndex, isLoaded]);

  const createWaveSurfer = () => {
    const accentColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-color")
        .trim() || "#0050ff";

    // Theme configurations
    const themes = {
      precision: {
        waveColor: "#333333",
        progressColor: accentColor,
        height: 250,
        barWidth: 0,
        barGap: 0,
        barRadius: 0,
      },
      prettiness: {
        waveColor: "#444444",
        progressColor: accentColor,
        height: 250,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
      },
      minimal: {
        waveColor: "#2a2a2a",
        progressColor: accentColor,
        height: 250,
        barWidth: 4,
        barGap: 2,
        barRadius: 0,
      },
    };

    const themeConfig = themes[wavesurferTheme] || themes.precision;

    const inst = WaveSurfer.create({
      container: containerRef.current,
      ...themeConfig,
      cursorColor: "#ffffff",
      normalize: true,
      responsive: true,
      backend: "WebAudio",
      interact: true,
      hideScrollbar: true,
    });

    // REGISTER hover plugin if enabled
    if (wavesurferShowHover) {
      try {
        hoverPluginRef.current = Hover.create({
          lineColor: "#ffffff",
          lineWidth: 1,
          labelBackground: "rgba(0,0,0,0.7)",
          labelColor: "#ffffff",
          labelSize: "11px",
          hideLabel: false,
          formatTimeCallback: (t) => {
            const m = Math.floor(t / 60);
            const s = Math.floor(t % 60)
              .toString()
              .padStart(2, "0");
            return `${m}:${s}`;
          },
        });
        inst.registerPlugin(hoverPluginRef.current);
      } catch (e) {
        console.warn("Failed to register hover plugin:", e);
        hoverPluginRef.current = null;
      }
    }

    inst.on("interaction", () => {
      if (inst.isPlaying()) inst.play();
    });
    inst.on("audioprocess", () => {
      try {
        const currentTime = inst.getCurrentTime();

        if (timeDisplayRef.current) {
          const m = Math.floor(currentTime / 60);
          const s = Math.floor(currentTime % 60);
          timeDisplayRef.current.textContent = `${m}:${s
            .toString()
            .padStart(2, "0")}`;
        }
      } catch (e) {}
    });
    inst.on("finish", () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    });
    inst.on("seek", () => {
      try {
        const currentTime = inst.getCurrentTime();

        if (timeDisplayRef.current) {
          const m = Math.floor(currentTime / 60);
          const s = Math.floor(currentTime % 60);
          timeDisplayRef.current.textContent = `${m}:${s
            .toString()
            .padStart(2, "0")}`;
        }
      } catch (e) {}
    });

    try {
      inst.setVolume && inst.setVolume(volume / 100);
      inst.setPlaybackRate && inst.setPlaybackRate(playbackSpeed);
    } catch (e) {}
    wsRef.current = inst;
    return inst;
  };

  useEffect(() => {
    if (wsRef.current && typeof wsRef.current.setVolume === "function") {
      try {
        wsRef.current.setVolume(volume / 100);
      } catch (e) {}
    }
  }, [volume]);

  // Update playback speed when it changes
  useEffect(() => {
    if (wsRef.current && typeof wsRef.current.setPlaybackRate === "function") {
      try {
        const ws = wsRef.current;
        const wasPlaying = ws.isPlaying && ws.isPlaying();
        const prevTime = ws.getCurrentTime ? ws.getCurrentTime() : 0;
        const dur = ws.getDuration ? ws.getDuration() : 0;

        ws.setPlaybackRate(playbackSpeed);

        // Force re-seek to the same absolute time (protect against internal rounding glitches)
        if (dur > 0 && prevTime >= 0 && prevTime <= dur) {
          const fraction = Math.min(Math.max(prevTime / dur, 0), 1);
          // Use requestAnimationFrame to allow internal nodes to settle before seeking
          requestAnimationFrame(() => {
            try {
              ws.seekTo(fraction);
              // If it was playing, resume to avoid a tiny pause artifact
              if (wasPlaying) ws.play();
            } catch (e) {}
          });
        }
      } catch (e) {
        console.warn("Failed to adjust playback rate:", e);
      }
    }
  }, [playbackSpeed]);

  // Update wavesurfer when theme changes
  useEffect(() => {
    if (wsRef.current) {
      // Recreate wavesurfer with new theme
      const wasPlaying = isPlaying;
      const currentTime = wsRef.current.getCurrentTime
        ? wsRef.current.getCurrentTime()
        : 0;

      try {
        wsRef.current.destroy();
      } catch (e) {}

      createWaveSurfer();

      // Reload current file if there was one
      if (files && files.length > 0 && currentIndex >= 0) {
        loadAtIndex(currentIndex, files, { autoPlay: wasPlaying }).then(() => {
          if (wsRef.current && currentTime > 0) {
            const dur = wsRef.current.getDuration();
            if (dur) wsRef.current.seekTo(currentTime / dur);
          }
        });
      }
    }
  }, [wavesurferTheme, wavesurferShowHover]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (wsRef.current) {
        const accentColor =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--accent-color")
            .trim() || "#0050ff";
        try {
          wsRef.current.setOptions({ progressColor: accentColor });
        } catch (e) {
          console.warn("Failed to update WaveSurfer color:", e);
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    createWaveSurfer();
    const container = containerRef.current;
    const onResize = () => {
      return;
    };
    window.addEventListener("resize", onResize);

    let ro;
    if (typeof ResizeObserver !== "undefined" && container) {
      ro = new ResizeObserver(onResize);
      ro.observe(container);
    }

    const el = containerRef.current;
    const onWheel = (e) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx) return;
      e.preventDefault();
      const THRESHOLD = 100;
      wheelAccRef.current += dx;
      while (wheelAccRef.current <= -THRESHOLD) {
        hopFnRef.current(1);
        wheelAccRef.current += THRESHOLD;
      }
      while (wheelAccRef.current >= THRESHOLD) {
        hopFnRef.current(-1);
        wheelAccRef.current -= THRESHOLD;
      }
    };
    if (el && el.addEventListener)
      el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("resize", onResize);
      if (ro && typeof ro.disconnect === "function") ro.disconnect();
      if (el && el.removeEventListener)
        el.removeEventListener("wheel", onWheel);

      if (
        currentLoadRef.current &&
        typeof currentLoadRef.current.cleanup === "function"
      ) {
        try {
          currentLoadRef.current.cleanup();
        } catch (e) {}
        currentLoadRef.current.cleanup = null;
        currentLoadRef.current.url = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.destroy();
        } catch (e) {}
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      window.electronAPI &&
      typeof window.electronAPI.onFilesLoaded === "function"
    ) {
      const unsub = window.electronAPI.onFilesLoaded((list) => {
        setFiles(list || []);
        if (list && list.length) {
          const rows = getVisibleRows(list);
          if (rows && rows.length) {
            loadAtIndex(rows[0].idx, list, { autoPlay: false });
          }
        }
      });
      return () => unsub && unsub();
    }

    return undefined;
  }, []);

  useEffect(() => {
    const loadLastFolder = async () => {
      const rememberLastFolder = localStorage.getItem("rememberLastFolder");
      const lastFolder = localStorage.getItem("lastOpenedFolder");

      if (rememberLastFolder === "true" && lastFolder && window.electronAPI) {
        try {
          const list = await window.electronAPI.readAudioFiles(lastFolder);
          if (list && list.length > 0) {
            setCurrentFolderPath(lastFolder);
            await preloadMetadataForInitialSort(list);
            setFiles(list);
            const rows = getVisibleRows(list);
            if (rows && rows.length) {
              loadAtIndex(rows[0].idx, list, { autoPlay: false });
            }
          }
        } catch (err) {
          console.warn("Failed to load last folder:", err);

          localStorage.removeItem("lastOpenedFolder");
        }
      }
    };

    loadLastFolder();
  }, []);

  useEffect(() => {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.getFileMetadata !== "function"
    ) {
      return;
    }
    let cancelled = false;

    const loadMetadata = async () => {
      const uniquePaths = [...new Set((files || []).filter(Boolean))];
      if (!uniquePaths.length) {
        setFileMetadata({});
        return;
      }
      try {
        const result = await window.electronAPI.getFileMetadata(uniquePaths);
        if (cancelled) return;
        const map = {};
        (result || []).forEach((item) => {
          if (item && item.path) {
            map[item.path] = item;
          }
        });
        setFileMetadata(map);
      } catch (e) {
        console.warn("Failed to load file metadata:", e);
      }
    };

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.onProbeDurationsProgress !== "function"
    ) {
      return;
    }

    const handler = (payload) => {
      if (!payload || !payload.path) return;
      const { path: p, duration: dur } = payload;
      if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
        const next = { ...(durationsRef.current || {}) };
        if (next[p] === dur) return;
        next[p] = dur;
        durationsRef.current = next;
        setDurations({ ...next });

        const baseList = Array.isArray(files) ? files : [];
        const currentPath =
          currentIndex >= 0 && baseList[currentIndex]
            ? baseList[currentIndex]
            : null;
        if (
          currentPath === p &&
          (!duration || !Number.isFinite(duration) || duration <= 0)
        ) {
          setDuration(dur);
        }
      }
    };

    const unsubscribe = window.electronAPI.onProbeDurationsProgress(handler);
    return () => {
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (e) {}
      }
    };
  }, [files, currentIndex, duration]);

  useEffect(() => {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.probeDurationsForFiles !== "function"
    ) {
      return;
    }

    const baseList = Array.isArray(files) ? files : [];
    const uniquePaths = [...new Set(baseList.filter(Boolean))];
    if (!uniquePaths.length) return;

    const attempts = ffprobeAttemptsRef.current || {};
    const pending = uniquePaths.filter((p) => !attempts[p]);
    if (!pending.length) return;

    let cancelled = false;

    const run = async () => {
      try {
        const result = await window.electronAPI.probeDurationsForFiles(pending);
        if (cancelled || !Array.isArray(result)) return;

        const map = { ...(durationsRef.current || {}) };
        (result || []).forEach((item) => {
          if (
            item &&
            item.path &&
            typeof item.duration === "number" &&
            Number.isFinite(item.duration) &&
            item.duration > 0
          ) {
            map[item.path] = item.duration;
          }
        });

        durationsRef.current = map;
        setDurations({ ...map });

        const updatedAttempts = { ...(ffprobeAttemptsRef.current || {}) };
        pending.forEach((p) => {
          updatedAttempts[p] = true;
        });
        ffprobeAttemptsRef.current = updatedAttempts;

        const currentPath =
          currentIndex >= 0 && baseList[currentIndex]
            ? baseList[currentIndex]
            : null;
        if (
          currentPath &&
          map[currentPath] &&
          (!duration || !Number.isFinite(duration) || duration <= 0)
        ) {
          setDuration(map[currentPath]);
        }
      } catch (e) {}
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [files, currentIndex, duration]);

  const handleSearchChange = (value) => {
    setSearchQuery(value);
  };

  const preloadMetadataForInitialSort = async (paths) => {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.getFileMetadata !== "function"
    ) {
      return;
    }
    const state = usePlayerStore.getState();
    const mode = state.sortMode;
    if (mode !== "date" && mode !== "dateOldest") {
      return;
    }
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    if (!uniquePaths.length) return;
    try {
      const result = await window.electronAPI.getFileMetadata(uniquePaths);
      const map = {};
      (result || []).forEach((item) => {
        if (item && item.path) {
          map[item.path] = item;
        }
      });
      setFileMetadata(map);
    } catch (e) {}
  };

  async function handleOpenFolder() {
    const folder = await window.electronAPI.openFolder();
    if (!folder) return;

    try {
      setFiles([]);
      setCurrentIndex(-1);
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsLoaded(false);
      setDuration(0);
      setTime(0);
      setFolderTree(null);
      setCurrentFolderPath(null);
      setDurations({});
      durationsRef.current = {};
      setFileMetadata({});

      if (wsRef.current) {
        try {
          wsRef.current.pause && wsRef.current.pause();
        } catch (e) {}
        try {
          wsRef.current.destroy();
        } catch (e) {}
        wsRef.current = null;
      }

      if (
        currentLoadRef.current &&
        typeof currentLoadRef.current.cleanup === "function"
      ) {
        try {
          currentLoadRef.current.cleanup();
        } catch (e) {}
        currentLoadRef.current.cleanup = null;
        currentLoadRef.current.url = null;
      }
    } catch (e) {
      console.warn("Error while clearing previous files:", e);
    }

    const list = await window.electronAPI.readAudioFiles(folder);
    setCurrentFolderPath(folder || null);
    await preloadMetadataForInitialSort(list);
    setFiles(list || []);

    if (localStorage.getItem("rememberLastFolder") === "true") {
      localStorage.setItem("lastOpenedFolder", folder);
    }

    if (!list || list.length === 0) {
      showToast("no supported audio files found in selected folder");
      return;
    }
    const rows = getVisibleRows(list);
    if (rows && rows.length) {
      loadAtIndex(rows[0].idx, list, { autoPlay: false });
    }
  }

  async function handleOpenFile() {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.openFiles !== "function"
    ) {
      return;
    }
    const hadFiles = Array.isArray(files) && files.length > 0;

    let selected;
    try {
      selected = await window.electronAPI.openFiles();
    } catch (e) {
      return;
    }
    if (!selected || !selected.length) return;

    const paths = selected.filter((p) => typeof p === "string" && p.trim());
    if (!paths.length) return;

    const AUDIO_EXTS = new Set([
      ".mp3",
      ".wav",
      ".flac",
      ".m4a",
      ".aac",
      ".ogg",
      ".oga",
      ".opus",
      ".aiff",
      ".aif",
      ".wma",
      ".ac3",
      ".dts",
      ".amr",
      ".ape",
      ".wv",
      ".spx",
      ".dsf",
      ".dff",
    ]);
    const valid = [];
    const invalid = [];

    paths.forEach((p) => {
      const lower = (p || "").toLowerCase();
      const dot = lower.lastIndexOf(".");
      const ext = dot >= 0 ? lower.slice(dot) : "";
      if (AUDIO_EXTS.has(ext)) {
        valid.push(p);
      } else {
        invalid.push(p);
      }
    });

    if (invalid.length) {
      const count = invalid.length;
      showToast(`${count} unsupported file${count > 1 ? "s" : ""} skipped`);
    }

    if (!valid.length) return;

    try {
      setFiles([]);
      setCurrentIndex(-1);
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsLoaded(false);
      setDuration(0);
      setTime(0);
      setFolderTree(null);
      setCurrentFolderPath(null);
      setDurations({});
      durationsRef.current = {};
      setFileMetadata({});

      if (wsRef.current) {
        try {
          wsRef.current.pause && wsRef.current.pause();
        } catch (e) {}
        try {
          wsRef.current.destroy();
        } catch (e) {}
        wsRef.current = null;
      }

      if (
        currentLoadRef.current &&
        typeof currentLoadRef.current.cleanup === "function"
      ) {
        try {
          currentLoadRef.current.cleanup();
        } catch (e) {}
        currentLoadRef.current.cleanup = null;
        currentLoadRef.current.url = null;
      }
    } catch (e) {
      console.warn("Error while clearing previous files for open file:", e);
    }

    valid.forEach((p) => {
      const name = (p || "").split(/[\/\\]/).pop();
      if (name) {
        originalNamesRef.current[p] = name;
      }
    });

    const nextList = [...valid];
    setFiles(nextList);

    const rows = getVisibleRows(nextList);
    if (rows && rows.length) {
      loadAtIndex(rows[0].idx, nextList, { autoPlay: !hadFiles });
    }
  }

  async function loadAtIndex(index, fromList, options = {}) {
    const { autoPlay = true } = options;
    const list = fromList || files;
    if (!list || index < 0 || index >= list.length) return;
    const filePath = list[index];
    setCurrentIndex(index);
    setSelectedIndex(index);

    const myToken = ++loadTokenRef.current;

    if (
      currentLoadRef.current &&
      typeof currentLoadRef.current.cleanup === "function"
    ) {
      try {
        currentLoadRef.current.cleanup();
      } catch (e) {}
      currentLoadRef.current.cleanup = null;
      currentLoadRef.current.url = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.pause && wsRef.current.pause();
      } catch (e) {}
      try {
        wsRef.current.empty && wsRef.current.empty();
      } catch (e) {}
    } else {
      createWaveSurfer();
    }

    setIsLoaded(false);
    setTime(0);
    setDuration(0);
    isPlayingRef.current = false;
    setIsPlaying(false);
    try {
      const data = await window.electronAPI.readFile(filePath);
      if (!data) throw new Error("No data returned");

      let arrayBuffer;
      const toArrayBuffer = (d) => {
        if (d instanceof ArrayBuffer) return d;
        if (d && d.buffer && d.buffer instanceof ArrayBuffer)
          return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
        if (Array.isArray(d)) return new Uint8Array(d).buffer;
        return Uint8Array.from(d).buffer;
      };

      arrayBuffer = toArrayBuffer(data);

      if (myToken !== loadTokenRef.current) return;

      const attachReadyHandler = (onReady) => {
        const handleReady = () => {
          if (myToken !== loadTokenRef.current) return;
          const wsNow = wsRef.current;
          const dur = wsNow.getDuration();
          setDuration(dur);
          if (filePath) {
            durationsRef.current[filePath] = dur;
            setDurations({ ...durationsRef.current });
          }

          try {
            if (wsNow.seekTo) wsNow.seekTo(0);
            else if (wsNow.setCurrentTime) wsNow.setCurrentTime(0);
          } catch (e) {}
          setTime(0);
          if (currentLoadRef.current && currentLoadRef.current.url) {
            try {
              URL.revokeObjectURL(currentLoadRef.current.url);
            } catch (e) {}
            currentLoadRef.current.url = null;
          }
          setIsLoaded(true);
          if (autoPlay && wsNow && typeof wsNow.play === "function") {
            try {
              wsNow.play();
              isPlayingRef.current = true;
              setIsPlaying(true);
            } catch (e) {
              isPlayingRef.current = false;
              setIsPlaying(false);
            }
          } else {
            isPlayingRef.current = false;
            setIsPlaying(false);
          }
          onReady && onReady();
        };
        currentLoadRef.current.cleanup = () => {
          try {
            if (wsRef.current) {
              wsRef.current.un
                ? wsRef.current.un("ready", handleReady)
                : wsRef.current.off && wsRef.current.off("ready", handleReady);
            }
          } catch (e) {}
          if (currentLoadRef.current && currentLoadRef.current.url) {
            try {
              URL.revokeObjectURL(currentLoadRef.current.url);
            } catch (e) {}
            currentLoadRef.current.url = null;
          }
        };
        wsRef.current.once && wsRef.current.once("ready", handleReady);
      };

      const attachErrorHandler = (onError) => {
        const handleError = (err) => {
          try {
            onError && onError(err);
          } catch (e) {}
        };
        currentLoadRef.current.errorCleanup = () => {
          try {
            if (wsRef.current) {
              wsRef.current.un
                ? wsRef.current.un("error", handleError)
                : wsRef.current.off && wsRef.current.off("error", handleError);
            }
          } catch (e) {}
        };
        wsRef.current.once && wsRef.current.once("error", handleError);
      };

      const tryLoadIntoWaveSurfer = async (buf) => {
        try {
          if (wsRef.current.loadArrayBuffer) {
            attachReadyHandler();
            attachErrorHandler(async () => {
              await doFfmpegFallback();
            });
            await wsRef.current.loadArrayBuffer(buf);
            return true;
          }

          const blob = new Blob([buf]);
          if (wsRef.current.loadBlob) {
            attachReadyHandler();
            attachErrorHandler(async () => {
              await doFfmpegFallback();
            });
            await wsRef.current.loadBlob(blob);
            return true;
          }
          const url = URL.createObjectURL(blob);
          currentLoadRef.current.url = url;
          attachReadyHandler();
          attachErrorHandler(async () => {
            await doFfmpegFallback();
          });
          wsRef.current.load(url);
          return true;
        } catch (e) {
          console.warn("WaveSurfer load error, will try fallback:", e);
          return false;
        }
      };

      const loadAudioData = async (buffer, isFallback = false) => {
        try {
          if (wsRef.current.loadArrayBuffer) {
            attachReadyHandler();
            await wsRef.current.loadArrayBuffer(buffer);
            return true;
          }
          const blob = new Blob([buffer]);
          if (wsRef.current.loadBlob) {
            attachReadyHandler();
            await wsRef.current.loadBlob(blob);
            return true;
          }
          const url = URL.createObjectURL(blob);
          currentLoadRef.current.url = url;
          attachReadyHandler();
          console.log("Loading audio from URL:", url);
          await wsRef.current.load(url);

          if (wsRef.current.getDuration() === 0) {
            throw new Error("File loaded but duration is 0");
          }

          return true;
        } catch (e) {
          console.error(
            `WaveSurfer load error (${
              isFallback ? "fallback attempt" : "initial attempt"
            }), will try fallback:`,
            e
          );
          return false;
        }
      };

      let fallbackAttempted = false;
      const doFfmpegFallback = async () => {
        if (fallbackAttempted) return;
        fallbackAttempted = true;

        try {
          console.log("Attempting ffmpeg fallback for:", filePath);
          const decoded = await window.electronAPI.decodeToWav(filePath);
          if (myToken !== loadTokenRef.current) return;
          if (decoded && decoded.data) {
            console.log("ffmpeg fallback successful, loading data...");
            const decodedArrayBuffer = toArrayBuffer(decoded.data);
            await loadAudioData(decodedArrayBuffer, true);
          } else {
            const errorMsg =
              decoded && decoded.error ? decoded.error : "Unknown error";
            console.error("ffmpeg decode returned no data or error:", errorMsg);
            const name = (filePath || "").split(/[\/\\]/).pop();
            const label = name ? `: ${name}` : "";
            showToast(`failed to decode audio file${label} (${errorMsg})`);
          }
        } catch (ffErr) {
          console.error("ffmpeg fallback failed:", ffErr);
          if (myToken !== loadTokenRef.current) return;
          const name = (filePath || "").split(/[\/\\]/).pop();
          const label = name ? `: ${name}` : "";
          showToast(`failed to decode audio file${label} (${ffErr.message})`);
        }
      };

      attachErrorHandler(async () => {
        console.warn("WaveSurfer emitted error event, triggering fallback...");
        await doFfmpegFallback();
      });

      const NATIVE_SUPPORTED_EXTS = new Set([".wav", ".mp3", ".flac", ".ogg"]);
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));

      if (!NATIVE_SUPPORTED_EXTS.has(ext)) {
        console.log(
          `File extension ${ext} not in native whitelist, forcing FFmpeg decoding...`
        );
        await doFfmpegFallback();
        return;
      }

      const wavesurferLoadSuccessful = await loadAudioData(arrayBuffer);

      if (!wavesurferLoadSuccessful) {
        console.warn("loadAudioData returned false, triggering fallback...");
        await doFfmpegFallback();
      }
    } catch (err) {
      console.error("Failed to load file via main:", err);
    }
  }

  function hop(direction) {
    const ws = wsRef.current;
    if (!ws) return;
    const t = ws.getCurrentTime ? ws.getCurrentTime() : time || 0;
    const dur = ws.getDuration ? ws.getDuration() : duration || 0;
    let nt = t + direction * nudgeAmount; // use nudgeAmount directly
    if (nt < 0) nt = 0;
    if (dur && nt > dur) nt = dur;
    if (dur && ws.seekTo) ws.seekTo(nt / dur);
    else if (ws.setCurrentTime) ws.setCurrentTime(nt);
  }

  function togglePlay() {
    if (!wsRef.current) return;
    if (!isLoaded) return;
    wsRef.current.playPause();
    const playing = wsRef.current.isPlaying();
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }

  useEffect(() => {
    hopFnRef.current = hop;
  }, [hop]);

  useEffect(() => {
    function onKey(e) {
      if (
        e.target &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        hop(-1); // was -1.5
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        hop(1); // was 1.5
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        next();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files, currentIndex, duration, time, nudgeAmount]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const ms = navigator.mediaSession;

    const filePath =
      currentIndex >= 0 && files[currentIndex] ? files[currentIndex] : null;
    if (!filePath) {
      try {
        ms.metadata = null;
      } catch (e) {}
      return;
    }

    const name =
      originalNamesRef.current[filePath] ||
      (filePath || "").split(/[\/\\]/).pop() ||
      "";

    try {
      ms.metadata = new MediaMetadata({
        title: name,
      });
    } catch (e) {}
  }, [files, currentIndex]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const ms = navigator.mediaSession;

    try {
      if (!isLoaded) {
        ms.playbackState = "none";
        if (
          window.electronAPI &&
          typeof window.electronAPI.updatePlaybackState === "function"
        ) {
          try {
            window.electronAPI.updatePlaybackState(false);
          } catch (e) {}
        }
        return;
      }
      ms.playbackState = isPlaying ? "playing" : "paused";
    } catch (e) {}
    if (
      window.electronAPI &&
      typeof window.electronAPI.updatePlaybackState === "function"
    ) {
      try {
        window.electronAPI.updatePlaybackState(!!(isLoaded && isPlaying));
      } catch (e) {}
    }
  }, [isLoaded, isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const ms = navigator.mediaSession;

    if (!isLoaded || !duration || typeof ms.setPositionState !== "function")
      return;

    const safeDuration = Number.isFinite(duration) ? duration : 0;
    const pos = Math.max(0, Math.min(safeDuration || 0, time || 0));

    try {
      ms.setPositionState({
        duration: safeDuration,
        position: pos,
      });
    } catch (e) {}
  }, [time, duration, isLoaded]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const ms = navigator.mediaSession;

    try {
      ms.setActionHandler("play", () => {
        togglePlay();
      });
      ms.setActionHandler("pause", () => {
        togglePlay();
      });
      ms.setActionHandler("playpause", () => {
        togglePlay();
      });
      ms.setActionHandler("nexttrack", () => {
        next();
      });
      ms.setActionHandler("previoustrack", () => {
        prev();
      });
      ms.setActionHandler("seekto", (details) => {
        if (!details || typeof details.seekTime !== "number") return;
        const dur =
          wsRef.current && wsRef.current.getDuration
            ? wsRef.current.getDuration()
            : duration;
        if (!dur) return;
        let nt = details.seekTime;
        if (nt < 0) nt = 0;
        if (nt > dur) nt = dur;
        if (wsRef.current && wsRef.current.seekTo) {
          wsRef.current.seekTo(nt / dur);
        }
      });
    } catch (e) {}

    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("playpause", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("seekto", null);
      } catch (e) {}
    };
  }, [files, currentIndex, isLoaded, duration]);

  const getVisibleRows = (baseOverride) => {
    const state = usePlayerStore.getState();
    const base = Array.isArray(baseOverride)
      ? baseOverride
      : Array.isArray(files)
      ? files
      : [];
    const pairs = base.map((f, idx) => ({ f, idx }));
    const q = (state.searchQuery || "").toLowerCase().trim();
    const filtered = q
      ? pairs.filter((p) => {
          const displayName = (getDisplayName(p.f) || "").toLowerCase();
          return displayName.includes(q);
        })
      : pairs;

    const mode = state.sortMode;
    const durationsMap = state.durations || {};
    const fileMetadataMap = state.fileMetadata || {};

    let rows = filtered;
    if (mode) {
      rows = [...filtered].sort((a, b) => {
        const fa = a.f;
        const fb = b.f;
        if (mode === "none" || mode === "name" || mode === "nameDesc") {
          const na = (getDisplayName(fa) || "").toLowerCase();
          const nb = (getDisplayName(fb) || "").toLowerCase();
          return mode === "nameDesc"
            ? nb.localeCompare(na)
            : na.localeCompare(nb);
        }
        if (mode === "length" || mode === "lengthDesc") {
          const la =
            typeof durationsMap[fa] === "number" ? durationsMap[fa] : Infinity;
          const lb =
            typeof durationsMap[fb] === "number" ? durationsMap[fb] : Infinity;
          if (la !== lb) return mode === "lengthDesc" ? lb - la : la - lb;
          const na = (getDisplayName(fa) || "").toLowerCase();
          const nb = (getDisplayName(fb) || "").toLowerCase();
          return na.localeCompare(nb);
        }
        if (mode === "date" || mode === "dateOldest") {
          const ma = fileMetadataMap[fa];
          const mb = fileMetadataMap[fb];
          const ta =
            ma &&
            (typeof ma.mtimeMs === "number"
              ? ma.mtimeMs
              : ma.mtimeIso
              ? Date.parse(ma.mtimeIso)
              : 0);
          const tb =
            mb &&
            (typeof mb.mtimeMs === "number"
              ? mb.mtimeMs
              : mb.mtimeIso
              ? Date.parse(mb.mtimeIso)
              : 0);
          if (ta !== tb) {
            return mode === "date"
              ? (tb || 0) - (ta || 0)
              : (ta || 0) - (tb || 0);
          }
          const na = (getDisplayName(fa) || "").toLowerCase();
          const nb = (getDisplayName(fb) || "").toLowerCase();
          return na.localeCompare(nb);
        }
        return 0;
      });
    }
    return rows;
  };

  function next() {
    const rows = getVisibleRows();
    if (!rows || !rows.length) return;

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
    const rows = getVisibleRows();
    if (!rows || !rows.length) return;

    const pos = rows.findIndex((row) => row.idx === currentIndex);
    if (pos < 0) {
      loadAtIndex(rows[rows.length - 1].idx);
      return;
    }
    if (pos - 1 >= 0) {
      loadAtIndex(rows[pos - 1].idx);
    }
  }

  function seekTo(evt) {
    if (!wsRef.current) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const t = (x / rect.width) * duration;
    wsRef.current.seekTo(t / duration);
  }

  const handleWaveMouseDown = (evt) => {
    if (!wsRef.current || !duration) return;
    isScrubbingRef.current = true;
    seekTo(evt);
  };

  const handleWaveMouseMove = (evt) => {
    if (!isScrubbingRef.current) return;
    seekTo(evt);
  };

  const handleWaveMouseUp = () => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
  };

  const handleWaveMouseLeave = () => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
  };

  const appendFilesToPlaylist = (entries, options = {}) => {
    const valid = (entries || []).filter((f) => f && f.path);
    if (!valid.length) return;

    valid.forEach((f) => {
      if (f.path && f.name) {
        originalNamesRef.current[f.path] = f.name;
      }
    });

    const paths = valid.map((f) => f.path);
    let nextFiles = null;
    let startIndex = -1;
    let shouldAutoPlay = false;

    setFiles((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      startIndex = base.length;
      shouldAutoPlay = options.autoPlayIfEmpty && base.length === 0;
      nextFiles = [...base, ...paths];
      return nextFiles;
    });

    if (shouldAutoPlay && nextFiles && nextFiles.length && startIndex >= 0) {
      loadAtIndex(startIndex, nextFiles);
    }
  };

  const replaceCurrentTrackWithFiles = (entries) => {
    const valid = (entries || []).filter((f) => f && f.path);
    if (!valid.length) return;

    valid.forEach((f) => {
      if (f.path && f.name) {
        originalNamesRef.current[f.path] = f.name;
      }
    });

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
      rest.forEach((f) => {
        base.push(f.path);
      });
      nextFiles = base;
    }

    setFiles(nextFiles);

    if (nextFiles && nextFiles.length) {
      if (
        indexToPlay == null ||
        indexToPlay < 0 ||
        indexToPlay >= nextFiles.length
      ) {
        indexToPlay = 0;
      }
      loadAtIndex(indexToPlay, nextFiles);
    }
  };

  const getDropTarget = (evt) => {
    const x = evt.clientX;
    const y = evt.clientY;

    const playerEl = playerAreaRef.current;
    if (playerEl) {
      const r = playerEl.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return "player";
      }
    }

    const playlistEl = playlistAreaRef.current;
    if (playlistEl) {
      const r = playlistEl.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return "playlist";
      }
    }

    return null;
  };

  const handleDropConfirmReplace = () => {
    if (!dropConfirm || !dropConfirm.files || !dropConfirm.files.length) {
      setDropConfirm(null);
      return;
    }
    replaceCurrentTrackWithFiles(dropConfirm.files);
    setDropConfirm(null);
  };

  const handleDropConfirmAdd = () => {
    if (!dropConfirm || !dropConfirm.files || !dropConfirm.files.length) {
      setDropConfirm(null);
      return;
    }
    appendFilesToPlaylist(dropConfirm.files, {
      autoPlayIfEmpty: !files || files.length === 0,
    });
    setDropConfirm(null);
  };

  const handleDropConfirmCancel = () => {
    setDropConfirm(null);
  };

  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
    };
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }

    setIsDragging(true);
    const target = getDropTarget(e);
    setDragTarget(target);

    dragTimeoutRef.current = setTimeout(() => {
      setIsDragging(false);
      setDragTarget(null);
    }, 100);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.currentTarget === e.target) {
      setIsDragging(false);
      setDragTarget(null);
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragTarget(null);
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }

    // Don't allow adding files when a folder is open
    if (currentFolderPath) {
      showToast("close the current folder to add files");
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    const target = getDropTarget(e) || "playlist";

    const filePaths = await Promise.all(
      droppedFiles.map(async (f) => {
        try {
          const arrayBuffer = await f.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const tempPath = await window.electronAPI.processFromBytes(
            f.name,
            uint8Array
          );
          return { path: tempPath, name: f.name };
        } catch (err) {
          console.warn(`Failed to process ${f.name}:`, err);
          return { path: null, name: f.name };
        }
      })
    );

    const validFiles = filePaths.filter((f) => f && f.path);
    const invalidFiles = filePaths.filter((f) => !f || !f.path);
    if (invalidFiles.length) {
      const count = invalidFiles.length;
      showToast(`${count} unsupported file${count > 1 ? "s" : ""} skipped`);
    }
    if (!validFiles.length) return;

    if (target === "player") {
      if (!files || files.length === 0) {
        appendFilesToPlaylist(validFiles, { autoPlayIfEmpty: true });
      } else {
        setDropConfirm({ files: validFiles });
      }
      return;
    }

    appendFilesToPlaylist(validFiles, {
      autoPlayIfEmpty: !files || files.length === 0,
    });
  };

  const handleDeleteTrack = (idx) => {
    setFiles(files.filter((_x, i2) => i2 !== idx));
    if (idx === currentIndex) {
      setCurrentIndex(-1);
      if (wsRef.current) {
        try {
          wsRef.current.pause && wsRef.current.pause();
        } catch (e) {}
        wsRef.current.empty && wsRef.current.empty();
      }
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsLoaded(false);
      if (
        currentLoadRef.current &&
        typeof currentLoadRef.current.cleanup === "function"
      ) {
        try {
          currentLoadRef.current.cleanup();
        } catch (e) {}
        currentLoadRef.current.cleanup = null;
        currentLoadRef.current.url = null;
      }
    }
    if (idx === selectedIndex) {
      setSelectedIndex(-1);
    } else if (idx < selectedIndex) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const getDisplayName = (filePath) => {
    const originalName = originalNamesRef.current[filePath];
    if (originalName) return originalName;
    return (filePath || "").split(/[\/\\]/).pop();
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden bg-pure-black p-24 gap-24"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toast message={toast?.message} onClose={hideToast} />

      <DropConfirmModal
        dropConfirm={dropConfirm}
        onReplace={handleDropConfirmReplace}
        onAdd={handleDropConfirmAdd}
        onCancel={handleDropConfirmCancel}
      />

      <PlayerArea
        playerAreaRef={playerAreaRef}
        containerRef={containerRef}
        isDragging={isDragging}
        dragTarget={dragTarget}
        files={files}
        currentIndex={currentIndex}
        getDisplayName={getDisplayName}
        isLoaded={isLoaded}
        time={time}
        duration={duration}
        volume={volume}
        setVolume={setVolume}
        hop={hop}
        prev={prev}
        next={next}
        togglePlay={togglePlay}
        isPlaying={isPlaying}
        seekTo={seekTo}
        handleWaveMouseDown={handleWaveMouseDown}
        handleWaveMouseMove={handleWaveMouseMove}
        handleWaveMouseUp={handleWaveMouseUp}
        handleWaveMouseLeave={handleWaveMouseLeave}
        timeDisplayRef={timeDisplayRef}
        nudgeAmount={nudgeAmount}
      />

      <PlaylistArea
        playlistAreaRef={playlistAreaRef}
        isDragging={isDragging}
        dragTarget={dragTarget}
        currentFolderPath={currentFolderPath}
        files={files}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        sortMode={sortMode}
        setSortMode={setSortMode}
        durations={durations}
        fileMetadata={fileMetadata}
        getDisplayName={getDisplayName}
        handleOpenFolder={handleOpenFolder}
        handleOpenFile={handleOpenFile}
        loadAtIndex={loadAtIndex}
        currentIndex={currentIndex}
        selectedIndex={selectedIndex}
        isPlaying={isPlaying}
        onDeleteTrack={handleDeleteTrack}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
    </div>
  );
}
