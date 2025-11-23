import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTrashCan,
  faPlay,
  faPause,
  faAnglesLeft,
  faAnglesRight,
  faFolderOpen,
  faSearch,
  faBackwardStep,
  faForwardStep,
} from '@fortawesome/free-solid-svg-icons'
// Use the browser-focused wavesurfer.js package
import WaveSurfer from "wavesurfer.js";

function formatTime(sec) {
  if (!isFinite(sec) || sec === null) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function AudioPlayer() {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const loadTokenRef = useRef(0);
  // Track the currently active load so we can revoke blob URLs and remove handlers
  const currentLoadRef = useRef({ url: null, cleanup: null });
  const wheelAccRef = useRef(0);

  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(100);
  const [folderTree, setFolderTree] = useState(null);
  const [durations, setDurations] = useState({});
  const durationsRef = useRef({});

  // Helper to create a fresh WaveSurfer instance bound to the container
  const createWaveSurfer = () => {
    const inst = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#A3BFFA",
      progressColor: "#4C51BF",
      cursorColor: "#1E293B",
      height: 300,
      normalize: true,
      responsive: true,
      backend: "WebAudio",
    });
    inst.on("interaction", () => inst.play());
    inst.on("audioprocess", () => {
      try {
        setTime(inst.getCurrentTime());
        setIsPlaying(inst.isPlaying());
      } catch (e) {}
    });
    inst.on("finish", () => setIsPlaying(false));
    inst.on("seek", () => {
      try {
        setTime(inst.getCurrentTime());
      } catch (e) {}
    });
    // apply current volume to new instance
    try {
      inst.setVolume && inst.setVolume(volume / 100);
    } catch (e) {}
    wsRef.current = inst;
    return inst;
  };

  // keep WaveSurfer volume in sync with UI slider
  useEffect(() => {
    if (wsRef.current && typeof wsRef.current.setVolume === "function") {
      try {
        wsRef.current.setVolume(volume / 100);
      } catch (e) {}
    }
  }, [volume]);
  useEffect(() => {
    // create initial WaveSurfer instance
    createWaveSurfer();
    const container = containerRef.current;
    const onResize = () => {
      // Nothing to resize for the removed RMS overlay; keep hook to trigger
      // any responsive behavior that may be needed in the future.
      return;
    };
    window.addEventListener("resize", onResize);
    // Also observe container size changes (more robust)
    let ro;
    if (typeof ResizeObserver !== "undefined" && container) {
      ro = new ResizeObserver(onResize);
      ro.observe(container);
    }

    // Horizontal scroll -> hop handler
    const el = containerRef.current;
    const onWheel = (e) => {
      // Prefer horizontal delta; allow shift+vertical to act as horizontal
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx) return;
      // prevent scroll/zoom
      e.preventDefault();
      // accumulate deltas; threshold triggers 1s hop
      const THRESHOLD = 100; // tune this for sensitivity
      wheelAccRef.current += dx;
      while (wheelAccRef.current <= -THRESHOLD) {
        hop(1.5);
        wheelAccRef.current += THRESHOLD;
      }
      while (wheelAccRef.current >= THRESHOLD) {
        hop(-1.5);
        wheelAccRef.current -= THRESHOLD;
      }
    };
    if (el && el.addEventListener)
      el.addEventListener("wheel", onWheel, { passive: false });
    // No global draw required; per-load handlers will set duration and UI.
    return () => {
      window.removeEventListener("resize", onResize);
      if (ro && typeof ro.disconnect === "function") ro.disconnect();
      if (el && el.removeEventListener)
        el.removeEventListener("wheel", onWheel);
      // cleanup any per-load resources (blob URLs / handlers)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for files loaded via application menu
  useEffect(
    () => {
      if (
        window.electronAPI &&
        typeof window.electronAPI.onFilesLoaded === "function"
      ) {
        const unsub = window.electronAPI.onFilesLoaded((list) => {
          setFiles(list || []);
          if (list && list.length) {
            loadAtIndex(0, list);
          }
        });
        return () => unsub && unsub();
      }
      // no-op cleanup
      return undefined;
    },
    [
      /* run once */
    ],
  );

  // If the user filters files such that the currently selected file is no
  // longer visible, clear selection and stop playback.
  useEffect(() => {
    const q = (searchQuery || "").toLowerCase().trim();
    if (!q) return;
    if (currentIndex >= 0 && files[currentIndex]) {
      const name = (files[currentIndex] || "").toLowerCase();
      if (!name.includes(q)) {
        if (wsRef.current) {
          try {
            wsRef.current.pause && wsRef.current.pause();
          } catch (e) {}
        }
        setCurrentIndex(-1);
        setIsPlaying(false);
        setIsLoaded(false);
      }
    }
  }, [searchQuery, files, currentIndex]);

  async function handleOpenFolder() {
    const folder = await window.electronAPI.openFolder();
    if (!folder) return;

    // Non-destructive cleanup: remove all files from UI and free audio resources
    try {
      setFiles([]);
      setCurrentIndex(-1);
      setIsPlaying(false);
      setIsLoaded(false);
      setDuration(0);
      setTime(0);
      setFolderTree(null);
      setDurations({});
      durationsRef.current = {};

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
      console.warn('Error while clearing previous files:', e);
    }

    const list = await window.electronAPI.readAudioFiles(folder);
    setFiles(list);
    if (list.length) {
      loadAtIndex(0, list);
    }
  }

  async function loadAtIndex(index, fromList) {
    const list = fromList || files;
    if (!list || index < 0 || index >= list.length) return;
    const filePath = list[index];
    setCurrentIndex(index);

    // Increment load token to invalidate any prior load promises
    const myToken = ++loadTokenRef.current;

    // Cancel any prior per-load cleanup (revoke URLs, remove handlers)
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

    // Request raw bytes from main process and load into WaveSurfer to avoid file:// restrictions
    // Reset playback state; reuse the existing WaveSurfer instance to avoid
    // repeatedly creating/destroying the heavy instance and AudioContext.
    if (wsRef.current) {
      try {
        wsRef.current.pause && wsRef.current.pause();
      } catch (e) {}
      try {
        // Clear any previously loaded buffer/peaks so new load is fresh
        wsRef.current.empty && wsRef.current.empty();
      } catch (e) {}
    } else {
      // If for some reason the instance was cleared, create a new one
      createWaveSurfer();
    }
    // mark as not ready until we receive the WaveSurfer "ready" event
    setIsLoaded(false);
    setTime(0);
    setDuration(0);
    setIsPlaying(false);
    try {
      const data = await window.electronAPI.readFile(filePath);
      if (!data) throw new Error("No data returned");

      // data may arrive as a Uint8Array-like object
      let arrayBuffer;
      const toArrayBuffer = (d) => {
        if (d instanceof ArrayBuffer) return d;
        if (d && d.buffer && d.buffer instanceof ArrayBuffer)
          return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
        if (Array.isArray(d)) return new Uint8Array(d).buffer;
        return Uint8Array.from(d).buffer;
      };

      arrayBuffer = toArrayBuffer(data);

      // Check token before proceeding with decode/load
      if (myToken !== loadTokenRef.current) return;

      // Try letting WaveSurfer load the buffer directly. This avoids an
      // extra decode pass (which was costly for large files). If WaveSurfer
      // emits an error, fall back to the ffmpeg decoder.
      const attachReadyHandler = (onReady) => {
        const handleReady = () => {
          if (myToken !== loadTokenRef.current) return;
          const wsNow = wsRef.current;
          setDuration(wsNow.getDuration());
          // ensure playback position resets to start for new file
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
          setIsPlaying(false);
          setIsLoaded(true);
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
              // WaveSurfer failed to decode -> fallback
              await doFfmpegFallback();
            });
            await wsRef.current.loadArrayBuffer(buf);
            return true;
          }
          // If loadArrayBuffer isn't available, try blob/loadBlob/load(url)
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

      const doFfmpegFallback = async () => {
        try {
          const decoded = await window.electronAPI.decodeToWav(filePath);
          if (myToken !== loadTokenRef.current) return;
          if (decoded && decoded.data) {
            const decodedArrayBuffer = toArrayBuffer(decoded.data);
            if (wsRef.current.loadArrayBuffer) {
              attachReadyHandler();
              await wsRef.current.loadArrayBuffer(decodedArrayBuffer);
            } else if (wsRef.current.loadBlob) {
              const blob = new Blob([decodedArrayBuffer]);
              attachReadyHandler();
              await wsRef.current.loadBlob(blob);
            } else {
              const blob = new Blob([decodedArrayBuffer]);
              const url = URL.createObjectURL(blob);
              currentLoadRef.current.url = url;
              attachReadyHandler();
              wsRef.current.load(url);
            }
          } else {
            console.error("ffmpeg decode returned no data or error:", decoded && decoded.error);
          }
        } catch (ffErr) {
          console.error("ffmpeg fallback failed:", ffErr);
        }
      };

      // Try WaveSurfer load first; fall back to ffmpeg if necessary
      const loaded = await tryLoadIntoWaveSurfer(arrayBuffer);
      if (!loaded) await doFfmpegFallback();

      if (myToken === loadTokenRef.current) {
        setIsPlaying(false);
      }
    } catch (err) {
      console.error("Failed to load file via main:", err);
    }
  }

  // Jump playback by `delta` seconds (positive or negative)
  function hop(delta) {
    const ws = wsRef.current;
    if (!ws) return;
    const t = ws.getCurrentTime ? ws.getCurrentTime() : time;
    const dur = ws.getDuration ? ws.getDuration() : duration;
    let nt = (t || 0) + delta;
    if (nt < 0) nt = 0;
    if (dur && nt > dur) nt = dur;
    if (dur) ws.seekTo(nt / dur);
    else if (ws.setCurrentTime) ws.setCurrentTime(nt);
  }

  function togglePlay() {
    if (!wsRef.current) return;
    if (!isLoaded) return;
    wsRef.current.playPause();
    setIsPlaying(wsRef.current.isPlaying());
  }

  // Keyboard shortcuts: left/right hop 1s, up/down change file, space play/pause
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
        hop(-1.5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        hop(1.5);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, currentIndex, duration, time]);

  function next() {
    if (currentIndex + 1 < files.length) loadAtIndex(currentIndex + 1);
  }
  function prev() {
    if (currentIndex - 1 >= 0) loadAtIndex(currentIndex - 1);
  }

  function seekTo(evt) {
    if (!wsRef.current) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const t = (x / rect.width) * duration;
    wsRef.current.seekTo(t / duration);
  }

  // RMS renderer removed: overlay canvas and drawRMS were intentionally deleted
  // to simplify rendering and avoid race conditions. WaveSurfer's own visual
  // handles are used instead.
  const buttonClass = "bg-gray-200 px-3 py-2 rounded no-drag";
  return (
    // make this component fill available space and allow internal children to size/scroll
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      <div className="relative rounded bg-slate-800 overflow-hidden">
        <div
          ref={containerRef}
          onClick={seekTo}
          style={{ width: "100%", height: 300 }}
        />
      </div>

      <div className="flex items-center mt-4 w-full">

        <div className="flex-1" >
        <label className="text-sm text-gray-400 mr-2 no-drag">Volume</label>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-28 h-2 accent-blue-500 no-drag"
            aria-label="Volume"
          />
          </div>
        
        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={() => hop(-1)}
            title="Jump -1s"
            className={buttonClass}
            aria-label="Jump back 1 second"
          >
            <FontAwesomeIcon icon={faAnglesLeft} />
          </button>
          <button
            onClick={prev}
            className={buttonClass}
            aria-label="Previous file"
          >
            <FontAwesomeIcon icon={faBackwardStep} />
            <span className="sr-only">Prev</span>
          </button>
          <button
            onClick={togglePlay}
            disabled={!isLoaded}
            className="bg-blue-500 text-white px-4 py-2 rounded no-drag disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
          </button>
          <button
            onClick={next}
            className={buttonClass}
            aria-label="Next file"
          >
            <FontAwesomeIcon icon={faForwardStep} />
            <span className="sr-only">Next</span>
          </button>
          <button
            onClick={() => hop(1)}
            title="Jump +1s"
            className={buttonClass}
            aria-label="Jump forward 1 second"
          >
            <FontAwesomeIcon icon={faAnglesRight} />
          </button>
        </div>
        <div className="flex-1 flex justify-end">
          <div className="text-sm text-gray-600 no-drag">
            {formatTime(time)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      <div className="mt-4 bg-gray-800 rounded shadow p-4 flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-200">Files</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
                <FontAwesomeIcon icon={faSearch} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="pl-8 pr-3 py-1 text-sm rounded bg-gray-700 text-white"
              />
            </div>
            <button
              onClick={handleOpenFolder}
              title="Load Folder"
              className="text-sm text-white bg-gray-900 px-2 py-1 rounded no-drag"
              aria-label="Load folder"
            >
              <FontAwesomeIcon icon={faFolderOpen} />
            </button>
          </div>
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-gray-500">No files loaded</div>
        ) : (
          (() => {
            const pairs = files.map((f, idx) => ({ f, idx }));
            const q = (searchQuery || "").toLowerCase().trim();
            const filtered = q
              ? pairs.filter((p) => (p.f || "").toLowerCase().includes(q))
              : pairs;

              return (
                <ul className="space-y-2 overflow-auto text-sm flex-1 min-h-0">
                {filtered.map(({ f, idx }) => (
                  <li
                    key={f + "-" + idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => loadAtIndex(idx)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadAtIndex(idx);
                    }}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer ${idx === currentIndex ? "bg-slate-900" : "hover:bg-slate-700"}`}
                  >
                    <div className="truncate pr-2 no-drag text-white">
                      {(f || "").split(/[\\/\\]/).pop()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-sm text-white bg-gray-900 px-2 py-1 rounded no-drag"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setFiles(files.filter((_x, i2) => i2 !== idx));
                          if (idx === currentIndex) {
                            setCurrentIndex(-1);
                            if (wsRef.current) {
                              try {
                                wsRef.current.pause && wsRef.current.pause();
                              } catch (e) {}
                              wsRef.current.empty && wsRef.current.empty();
                            }
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
                        }}
                        aria-label={`Delete ${(f || "").split(/[\\/\\\\]/).pop()}`}
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()
        )}
      </div>
    </div>
  );
}
