import { useEffect } from "react";

// mirrors what is playing into the browser's media session
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
    if (!hasMediaSession) return;
    try {
      navigator.mediaSession.playbackState = !isLoaded
        ? "none"
        : isPlaying
          ? "playing"
          : "paused";
    } catch (e) { }
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
