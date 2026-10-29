import { useEffect } from "react";

const isTypingTarget = (target) =>
  target &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable);

// hardware media keys (via the main process), keyboard shortcuts and the
// os media session controls, all routed to the stable player actions
export function useMediaKeys(actions) {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return undefined;
    const unsubscribes = [];
    if (typeof api.onMediaPlayPause === "function") {
      unsubscribes.push(api.onMediaPlayPause(() => actions.togglePlay()));
    }
    if (typeof api.onMediaNext === "function") {
      unsubscribes.push(api.onMediaNext(() => actions.next()));
    }
    if (typeof api.onMediaPrevious === "function") {
      unsubscribes.push(api.onMediaPrevious(() => actions.prev()));
    }
    return () => {
      unsubscribes.forEach((fn) => {
        try {
          if (typeof fn === "function") fn();
        } catch (e) { }
      });
    };
  }, [actions]);

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        actions.hop(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        actions.hop(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        actions.prev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        actions.next();
      } else if (e.code === "Space") {
        e.preventDefault();
        actions.togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return undefined;
    }
    const ms = navigator.mediaSession;
    // "playpause" is not a MediaSessionAction; registering it threw and
    // silently skipped every handler after it
    const handlers = {
      play: () => actions.togglePlay(),
      pause: () => actions.togglePlay(),
      nexttrack: () => actions.next(),
      previoustrack: () => actions.prev(),
      seekto: (details) => {
        if (!details || typeof details.seekTime !== "number") return;
        actions.seekToSeconds(details.seekTime);
      },
    };
    // one unsupported action must not take the others down with it
    const setHandler = (name, fn) => {
      try {
        ms.setActionHandler(name, fn);
      } catch (e) { }
    };
    Object.entries(handlers).forEach(([name, fn]) => setHandler(name, fn));
    return () => {
      Object.keys(handlers).forEach((name) => setHandler(name, null));
    };
  }, [actions]);
}
