import WaveSurfer from "wavesurfer.js";
import Hover from "wavesurfer.js/dist/plugins/hover.esm.js";
import usePlayerStore from "../store/usePlayerStore";

export const WAVEFORM_HEIGHT = 250;

// waveform looks. "default" is the continuous filled waveform from the readme
// screenshot; the other two render bars. only these keys differ per theme, so
// switching is a live setOptions() call instead of a destroy + reload.
const WAVEFORM_THEMES = {
  default: { waveColor: "#333333", barWidth: 0, barGap: 0, barRadius: 0 },
  sleek: { waveColor: "#444444", barWidth: 3, barGap: 2, barRadius: 3 },
  classic: { waveColor: "#2a2a2a", barWidth: 4, barGap: 2, barRadius: 0 },
};

export function getAccentColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color")
      .trim() || "#0050ff"
  );
}

export function getThemeOptions(theme) {
  const base = WAVEFORM_THEMES[theme] || WAVEFORM_THEMES.default;
  return { ...base, progressColor: getAccentColor(), height: WAVEFORM_HEIGHT };
}

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function createHoverPlugin() {
  try {
    return Hover.create({
      lineColor: "#ffffff",
      lineWidth: 1,
      labelBackground: "rgba(0,0,0,0.7)",
      labelColor: "#ffffff",
      labelSize: "11px",
      hideLabel: false,
      formatTimeCallback: formatClock,
    });
  } catch (e) {
    console.warn("Failed to create hover plugin:", e);
    return null;
  }
}

// builds a wavesurfer instance configured from the current store state.
// returns { ws, hoverPlugin }; the caller owns both refs.
export function createWaveSurfer({ container, timeDisplayRef, onPlayingChange }) {
  const {
    wavesurferTheme,
    wavesurferShowHover,
    volume,
    playbackSpeed,
    preservePitch,
  } = usePlayerStore.getState();

  const ws = WaveSurfer.create({
    container,
    ...getThemeOptions(wavesurferTheme),
    cursorColor: "#ffffff",
    normalize: true,
    interact: true,
    hideScrollbar: true,
  });

  let hoverPlugin = null;
  if (wavesurferShowHover) {
    const plugin = createHoverPlugin();
    if (plugin) {
      try {
        ws.registerPlugin(plugin);
        hoverPlugin = plugin;
      } catch (e) {
        console.warn("Failed to register hover plugin:", e);
      }
    }
  }

  // keep the unsubscribe handles and release them when the instance goes
  // away, instead of relying on destroy() alone
  const unsubscribers = [];
  const listen = (event, handler) => {
    const off = ws.on(event, handler);
    if (typeof off === "function") unsubscribers.push(off);
  };
  ws.once("destroy", () => {
    unsubscribers.forEach((off) => {
      try {
        off();
      } catch (e) { }
    });
  });

  const showTime = () => {
    try {
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = formatClock(ws.getCurrentTime());
      }
    } catch (e) { }
  };

  listen("interaction", () => {
    // resume if it was already playing, or if the user asked for seeks to
    // start playback while paused
    const { playOnSeekWhenPaused } = usePlayerStore.getState();
    const wasPlaying = ws.isPlaying();
    if (wasPlaying || playOnSeekWhenPaused) {
      ws.play();
      onPlayingChange(true);
    }
  });
  listen("audioprocess", showTime);
  listen("finish", () => onPlayingChange(false));
  listen("seeking", showTime);

  try {
    ws.setVolume && ws.setVolume(volume / 100);
    const mediaEl = ws.getMediaElement?.();
    if (mediaEl) {
      mediaEl.preservesPitch = preservePitch;
    }
    ws.setPlaybackRate && ws.setPlaybackRate(playbackSpeed);
  } catch (e) { }

  return { ws, hoverPlugin };
}
