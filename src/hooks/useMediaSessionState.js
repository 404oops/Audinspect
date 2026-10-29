import { useEffect } from "react";

// mirrors what is playing into the os media session and the taskbar buttons
export function useMediaSessionState({
  files,
  currentIndex,
  isLoaded,
  isPlaying,
  time,
  duration,
  getDisplayName,
}) {
  const hasMediaSession =
    typeof navigator !== "undefined" && "mediaSession" in navigator;

  useEffect(() => {
    if (!hasMediaSession) return;
    const ms = navigator.mediaSession;
    const filePath =
      currentIndex >= 0 && files[currentIndex] ? files[currentIndex] : null;
    try {
      ms.metadata = filePath
        ? new MediaMetadata({ title: getDisplayName(filePath) || "" })
        : null;
    } catch (e) { }
  }, [files, currentIndex, getDisplayName, hasMediaSession]);

  useEffect(() => {
    const api = window.electronAPI;
    const playing = !!(isLoaded && isPlaying);
    if (hasMediaSession) {
      try {
        navigator.mediaSession.playbackState = !isLoaded
          ? "none"
          : isPlaying
            ? "playing"
            : "paused";
      } catch (e) { }
    }
    if (api && typeof api.updatePlaybackState === "function") {
      try {
        api.updatePlaybackState(playing);
      } catch (e) { }
    }
  }, [isLoaded, isPlaying, hasMediaSession]);

  useEffect(() => {
    if (!hasMediaSession) return;
    const ms = navigator.mediaSession;
    if (!isLoaded || !duration || typeof ms.setPositionState !== "function") {
      return;
    }
    const safeDuration = Number.isFinite(duration) ? duration : 0;
    const pos = Math.max(0, Math.min(safeDuration || 0, time || 0));
    try {
      ms.setPositionState({ duration: safeDuration, position: pos });
    } catch (e) { }
  }, [time, duration, isLoaded, hasMediaSession]);
}
