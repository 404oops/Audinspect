import usePlayerStore from "../store/usePlayerStore";
import platform from "../platform";
import { isNativeExtension } from "../audio/nativeSupport";
import { decodeToPcm } from "../audio/decodeAudio";
import { encodeWav } from "../audio/wavEncode";
import { getExtension } from "../utils/audioExtensions";

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
//
// formats the browser plays natively go straight to wavesurfer. everything
// else (and any native attempt that fails) is decoded in the browser by
// mediabunny / @audio/decode and handed over as pcm wav, the same way the
// desktop app handed over ffmpeg's output.
export async function loadTrack({ filePath, token, autoPlay, refs, setPlaying }) {
  const { wsRef, loadTokenRef, currentLoadRef, durationsRef } = refs;
  const isStale = () => token !== loadTokenRef.current;
  const showToast = (msg) => usePlayerStore.getState().showToast(msg);

  try {
    const blob = await platform.readFile(filePath);
    if (!blob) throw new Error("No data returned");
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

    // `channelData` + `duration` skip wavesurfer's own decode of the blob
    const loadAudioData = async (audioBlob, channelData, duration, isFallback = false) => {
      try {
        attachReadyHandler();
        await wsRef.current.loadBlob(audioBlob, channelData, duration);
        return true;
      } catch (e) {
        // wavesurfer rejects a load that a newer load superseded; that is
        // not a decode failure, so don't start the decoder fallback for it
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
    const doDecodeFallback = async () => {
      if (fallbackAttempted) return;
      fallbackAttempted = true;

      const startedAt = Date.now();
      try {
        console.log("Decoding in the browser:", filePath);
        const pcm = await decodeToPcm(blob, filePath, { isStale });
        if (isStale()) return;
        const wav = encodeWav(pcm.channelData, pcm.sampleRate);
        console.log(
          `${pcm.engine} decoded ${basename(filePath)} (${(wav.size / 1024 / 1024).toFixed(1)} MB) in ${Date.now() - startedAt} ms`
        );
        await loadAudioData(wav, pcm.channelData, pcm.duration, true);
      } catch (err) {
        if (isStale() || (err && err.message === "superseded")) return;
        console.error("browser decode failed:", err);
        const name = basename(filePath);
        const label = name ? `: ${name}` : "";
        showToast(`failed to decode audio file${label} (${err.message})`);
      }
    };

    attachErrorHandler(async () => {
      console.warn("WaveSurfer emitted error event, triggering fallback...");
      await doDecodeFallback();
    });

    const ext = getExtension(filePath);
    if (!isNativeExtension(ext)) {
      console.log(`${ext} is not playable by this browser, decoding...`);
      await doDecodeFallback();
      return;
    }

    const wavesurferLoadSuccessful = await loadAudioData(blob);
    if (!wavesurferLoadSuccessful) {
      console.warn("loadAudioData returned false, triggering fallback...");
      await doDecodeFallback();
    }
  } catch (err) {
    console.error("Failed to load file:", err);
    if (!isStale()) {
      const name = basename(filePath);
      usePlayerStore.getState().showToast(
        `failed to open${name ? `: ${name}` : ""} (${err && err.message ? err.message : err})`
      );
    }
  }
}
