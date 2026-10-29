import usePlayerStore from "../store/usePlayerStore";

// formats chromium decodes on its own; everything else goes through ffmpeg
const NATIVE_SUPPORTED_EXTS = new Set([".wav", ".mp3", ".flac", ".ogg"]);

export function toArrayBuffer(d) {
  if (d instanceof ArrayBuffer) return d;
  if (d && d.buffer && d.buffer instanceof ArrayBuffer)
    return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
  if (Array.isArray(d)) return new Uint8Array(d).buffer;
  return Uint8Array.from(d).buffer;
}

function revokeCurrentUrl(currentLoadRef) {
  if (currentLoadRef.current && currentLoadRef.current.url) {
    try {
      URL.revokeObjectURL(currentLoadRef.current.url);
    } catch (e) { }
    currentLoadRef.current.url = null;
  }
}

function offEvent(ws, event, handler) {
  if (!ws) return;
  try {
    if (ws.un) ws.un(event, handler);
    else if (ws.off) ws.off(event, handler);
  } catch (e) { }
}

// playback speed, pitch preservation and output device from settings
function applyPlaybackSettings(ws) {
  const s = usePlayerStore.getState();
  try {
    if (ws.setPlaybackRate && s.playbackSpeed) {
      ws.setPlaybackRate(s.playbackSpeed);
    }
    const mediaElement = ws.getMediaElement?.();
    if (mediaElement) {
      mediaElement.preservesPitch = s.preservePitch;
      if (s.audioOutputDevice && typeof mediaElement.setSinkId === "function") {
        mediaElement.setSinkId(s.audioOutputDevice).catch(() => { });
      }
    } else if (s.audioOutputDevice && typeof ws.setSinkId === "function") {
      ws.setSinkId(s.audioOutputDevice).catch(() => { });
    }
  } catch (e) { }
}

const basename = (p) => (p || "").split(/[\/\\]/).pop();

// loads one file into the current wavesurfer instance. every step checks
// that `token` is still the latest load so a quick next/prev can't let a
// stale file win.
export async function loadTrack({ filePath, token, autoPlay, refs, setPlaying }) {
  const { wsRef, loadTokenRef, currentLoadRef, durationsRef } = refs;
  const isStale = () => token !== loadTokenRef.current;
  const showToast = (msg) => usePlayerStore.getState().showToast(msg);

  try {
    const data = await window.electronAPI.readFile(filePath);
    if (!data) throw new Error("No data returned");

    const arrayBuffer = toArrayBuffer(data);
    if (isStale()) return;

    const attachReadyHandler = (onReady) => {
      const handleReady = () => {
        if (isStale()) return;
        const { setDuration, setDurations, setTime, setIsLoaded } =
          usePlayerStore.getState();
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
        } catch (e) { }
        setTime(0);
        revokeCurrentUrl(currentLoadRef);
        setIsLoaded(true);

        applyPlaybackSettings(wsNow);

        if (autoPlay && wsNow && typeof wsNow.play === "function") {
          try {
            wsNow.play();
            setPlaying(true);
          } catch (e) {
            setPlaying(false);
          }
        } else {
          setPlaying(false);
        }
        onReady && onReady();
      };
      currentLoadRef.current.cleanup = () => {
        offEvent(wsRef.current, "ready", handleReady);
        revokeCurrentUrl(currentLoadRef);
        try {
          if (
            currentLoadRef.current &&
            typeof currentLoadRef.current.errorCleanup === "function"
          ) {
            currentLoadRef.current.errorCleanup();
          }
        } catch (e) { }
        if (currentLoadRef.current) {
          currentLoadRef.current.errorCleanup = null;
        }
      };
      wsRef.current.once && wsRef.current.once("ready", handleReady);
    };

    const attachErrorHandler = (onError) => {
      const handleError = (err) => {
        try {
          onError && onError(err);
        } catch (e) { }
      };
      currentLoadRef.current.errorCleanup = () => {
        offEvent(wsRef.current, "error", handleError);
      };
      wsRef.current.once && wsRef.current.once("error", handleError);
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
        // wavesurfer rejects a load that a newer load superseded; that is
        // not a decode failure, so don't start the ffmpeg fallback for it
        if (isStale()) return true;
        console.error(
          `WaveSurfer load error (${isFallback ? "fallback attempt" : "initial attempt"
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
        if (isStale()) return;
        if (decoded && decoded.data) {
          console.log("ffmpeg fallback successful, loading data...");
          await loadAudioData(toArrayBuffer(decoded.data), true);
        } else {
          const errorMsg =
            decoded && decoded.error ? decoded.error : "Unknown error";
          console.error("ffmpeg decode returned no data or error:", errorMsg);
          const name = basename(filePath);
          const label = name ? `: ${name}` : "";
          showToast(`failed to decode audio file${label} (${errorMsg})`);
        }
      } catch (ffErr) {
        console.error("ffmpeg fallback failed:", ffErr);
        if (isStale()) return;
        const name = basename(filePath);
        const label = name ? `: ${name}` : "";
        showToast(`failed to decode audio file${label} (${ffErr.message})`);
      }
    };

    attachErrorHandler(async () => {
      console.warn("WaveSurfer emitted error event, triggering fallback...");
      await doFfmpegFallback();
    });

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
