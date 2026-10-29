import { useEffect } from "react";
import usePlayerStore from "../store/usePlayerStore";
import {
  saveDurationsFromProbeResults,
  getCachedDurationsForPaths,
} from "../utils/metadataClient";

const isValidDuration = (d) => typeof d === "number" && Number.isFinite(d) && d > 0;

// the current track has no usable length yet (still loading, or decode failed)
const needsDuration = (d) => !d || !Number.isFinite(d) || d <= 0;

const pickDurations = (items) => {
  const picked = {};
  (items || []).forEach((item) => {
    if (item && item.path && isValidDuration(item.duration)) {
      picked[item.path] = item.duration;
    }
  });
  return picked;
};

// track lengths for the playlist: streamed probe progress, the indexeddb
// cache, and a probe pass for whatever is still unknown. `durationsRef` is
// the authoritative map, `ffprobeAttemptsRef` remembers what was tried.
export function useDurations({
  files,
  currentIndex,
  duration,
  fileMetadata,
  durationsRef,
  ffprobeAttemptsRef,
}) {
  const setDurations = usePlayerStore((s) => s.setDurations);
  const setDuration = usePlayerStore((s) => s.setDuration);

  // per-file progress events from the batch probe
  useEffect(() => {
    const api = window.electronAPI;
    if (!api || typeof api.onProbeDurationsProgress !== "function") {
      return undefined;
    }
    const handler = (payload) => {
      if (!payload || !payload.path) return;
      const { path: p, duration: dur } = payload;
      if (!isValidDuration(dur)) return;
      const next = { ...(durationsRef.current || {}) };
      if (next[p] === dur) return;
      next[p] = dur;
      durationsRef.current = next;
      setDurations({ ...next });

      const baseList = Array.isArray(files) ? files : [];
      const currentPath =
        currentIndex >= 0 && baseList[currentIndex] ? baseList[currentIndex] : null;
      if (currentPath === p && needsDuration(duration)) {
        setDuration(dur);
      }
    };
    const unsubscribe = api.onProbeDurationsProgress(handler);
    return () => {
      try {
        if (typeof unsubscribe === "function") unsubscribe();
      } catch (e) { }
    };
  }, [files, currentIndex, duration, durationsRef, setDurations, setDuration]);

  // cached lengths (validated against size + mtime by the worker)
  useEffect(() => {
    const run = async () => {
      const baseList = Array.isArray(files) ? files : [];
      const uniquePaths = [...new Set(baseList.filter(Boolean))];
      if (!uniquePaths.length) return;

      const state = usePlayerStore.getState();
      const metaMap =
        state.fileMetadata && typeof state.fileMetadata === "object"
          ? state.fileMetadata
          : {};

      try {
        const cached = await getCachedDurationsForPaths(uniquePaths, metaMap);
        if (!Array.isArray(cached) || !cached.length) return;

        const found = pickDurations(cached);
        const map = { ...(durationsRef.current || {}), ...found };
        const attempts = { ...(ffprobeAttemptsRef.current || {}) };
        Object.keys(found).forEach((p) => {
          attempts[p] = true;
        });

        durationsRef.current = map;
        ffprobeAttemptsRef.current = attempts;
        setDurations({ ...map });

        const list = Array.isArray(state.files) ? state.files : [];
        const currentPath =
          state.currentIndex >= 0 && list[state.currentIndex]
            ? list[state.currentIndex]
            : null;
        if (currentPath && map[currentPath] && needsDuration(duration)) {
          setDuration(map[currentPath]);
        }
      } catch (e) { }
    };
    run();
  }, [
    files,
    fileMetadata,
    currentIndex,
    duration,
    durationsRef,
    ffprobeAttemptsRef,
    setDurations,
    setDuration,
  ]);

  // probe whatever is still unknown
  useEffect(() => {
    const api = window.electronAPI;
    if (!api || typeof api.probeDurationsForFiles !== "function") {
      return undefined;
    }
    const baseList = Array.isArray(files) ? files : [];
    const uniquePaths = [...new Set(baseList.filter(Boolean))];
    if (!uniquePaths.length) return undefined;

    const attempts = ffprobeAttemptsRef.current || {};
    const pending = uniquePaths.filter((p) => !attempts[p]);
    if (!pending.length) return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        const result = await api.probeDurationsForFiles(pending);
        if (cancelled || !Array.isArray(result)) return;

        const map = { ...(durationsRef.current || {}), ...pickDurations(result) };
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
        if (currentPath && map[currentPath] && needsDuration(duration)) {
          setDuration(map[currentPath]);
        }

        try {
          await saveDurationsFromProbeResults(result);
        } catch (e) { }
      } catch (e) { }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    files,
    currentIndex,
    duration,
    durationsRef,
    ffprobeAttemptsRef,
    setDurations,
    setDuration,
  ]);
}
