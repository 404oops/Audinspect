import { useEffect } from "react";
import usePlayerStore from "../store/usePlayerStore";
import {
  getThemeOptions,
  getAccentColor,
  createHoverPlugin,
} from "../player/createWaveSurfer";

// pushes settings changes into the live wavesurfer instance
export function useWaveSurferSettings(wsRef, hoverPluginRef) {
  const volume = usePlayerStore((s) => s.volume);
  const audioOutputDevice = usePlayerStore((s) => s.audioOutputDevice);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const preservePitch = usePlayerStore((s) => s.preservePitch);
  const wavesurferTheme = usePlayerStore((s) => s.wavesurferTheme);
  const wavesurferShowHover = usePlayerStore((s) => s.wavesurferShowHover);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && typeof ws.setVolume === "function") {
      try {
        ws.setVolume(volume / 100);
      } catch (e) { }
    }
  }, [volume, wsRef]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!audioOutputDevice || !ws) return;
    const applyDevice = async () => {
      try {
        const mediaElement = ws.getMediaElement?.();
        if (mediaElement && typeof mediaElement.setSinkId === "function") {
          await mediaElement.setSinkId(audioOutputDevice);
        } else if (typeof ws.setSinkId === "function") {
          await ws.setSinkId(audioOutputDevice);
        }
      } catch (error) {
        console.warn("Failed to set audio output device:", error);
      }
    };
    applyDevice();
  }, [audioOutputDevice, wsRef]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || typeof ws.setPlaybackRate !== "function") return;
    try {
      const wasPlaying = ws.isPlaying && ws.isPlaying();
      const prevTime = ws.getCurrentTime ? ws.getCurrentTime() : 0;
      const dur = ws.getDuration ? ws.getDuration() : 0;

      const mediaEl = ws.getMediaElement?.();
      if (mediaEl) {
        mediaEl.preservesPitch = preservePitch;
      }

      ws.setPlaybackRate(playbackSpeed);

      // re-seek to the same absolute time to protect against rounding
      // glitches inside the media element when the rate changes
      if (dur > 0 && prevTime >= 0 && prevTime <= dur) {
        const fraction = Math.min(Math.max(prevTime / dur, 0), 1);
        requestAnimationFrame(() => {
          try {
            ws.seekTo(fraction);
            if (wasPlaying) ws.play();
          } catch (e) { }
        });
      }
    } catch (e) {
      console.warn("Failed to adjust playback rate:", e);
    }
  }, [playbackSpeed, preservePitch, wsRef]);

  // waveform look changes apply in place; no destroy, no reload, no pause
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      ws.setOptions(getThemeOptions(wavesurferTheme));
    } catch (e) {
      console.warn("Failed to apply waveform theme:", e);
    }
  }, [wavesurferTheme, wsRef]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (wavesurferShowHover && !hoverPluginRef.current) {
      const plugin = createHoverPlugin();
      if (!plugin) return;
      try {
        ws.registerPlugin(plugin);
        hoverPluginRef.current = plugin;
      } catch (e) {
        console.warn("Failed to register hover plugin:", e);
      }
    } else if (!wavesurferShowHover && hoverPluginRef.current) {
      try {
        ws.unregisterPlugin(hoverPluginRef.current);
      } catch (e) { }
      hoverPluginRef.current = null;
    }
  }, [wavesurferShowHover, wsRef, hoverPluginRef]);

  // accent color is a css variable set on <html>; follow it live
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const ws = wsRef.current;
      if (!ws) return;
      try {
        ws.setOptions({ progressColor: getAccentColor() });
      } catch (e) {
        console.warn("Failed to update WaveSurfer color:", e);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => observer.disconnect();
  }, [wsRef]);
}
