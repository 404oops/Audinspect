import { useEffect } from "react";
import platform from "../platform";
import usePlayerStore from "../store/usePlayerStore";

// keeps the list in sync with files added to / removed from the open folder
export function useFolderWatcher({ currentFolderPath, durationsRef, ffprobeAttemptsRef }) {
  useEffect(() => {
    const api = platform;
    if (!api || typeof api.onFolderFilesDelta !== "function") return undefined;

    const unsubscribe = api.onFolderFilesDelta((payload) => {
      if (!payload || !payload.folderPath) return;
      const { folderPath, added, removed } = payload;
      if (!currentFolderPath || folderPath !== currentFolderPath) return;

      const state = usePlayerStore.getState();
      const prevFiles = Array.isArray(state.files) ? state.files : [];
      const addedList = Array.isArray(added) ? added : [];
      const removedList = Array.isArray(removed) ? removed : [];
      if (!addedList.length && !removedList.length) return;

      const removedSet = new Set(removedList.filter(Boolean));
      const nextFiles = prevFiles.filter((p) => p && !removedSet.has(p));
      const present = new Set(nextFiles);
      addedList.forEach((p) => {
        if (p && !present.has(p)) {
          present.add(p);
          nextFiles.push(p);
        }
      });

      const pathAt = (idx) =>
        idx >= 0 && idx < prevFiles.length ? prevFiles[idx] : null;
      const prevCurrentPath = pathAt(state.currentIndex);
      const prevSelectedPath = pathAt(state.selectedIndex);

      const indexByPath = new Map();
      nextFiles.forEach((p, idx) => indexByPath.set(p, idx));
      const nextCurrentIndex = indexByPath.has(prevCurrentPath)
        ? indexByPath.get(prevCurrentPath)
        : -1;
      const nextSelectedIndex = indexByPath.has(prevSelectedPath)
        ? indexByPath.get(prevSelectedPath)
        : -1;

      // clear probe attempts for new files so durations get probed
      if (addedList.length && ffprobeAttemptsRef.current) {
        const attempts = ffprobeAttemptsRef.current;
        addedList.forEach((p) => {
          if (p && attempts[p]) delete attempts[p];
        });
      }

      state.setFiles(nextFiles);
      state.setCurrentIndex(nextCurrentIndex);
      state.setSelectedIndex(nextSelectedIndex);

      if (!addedList.length) return;

      // explicitly fetch metadata and durations for newly added files
      if (typeof api.getFileMetadata === "function") {
        api
          .getFileMetadata(addedList)
          .then((result) => {
            if (!Array.isArray(result) || !result.length) return;
            const currentState = usePlayerStore.getState();
            const base =
              currentState.fileMetadata &&
                typeof currentState.fileMetadata === "object"
                ? currentState.fileMetadata
                : {};
            const next = { ...base };
            result.forEach((item) => {
              if (item && item.path) {
                next[item.path] = { ...(next[item.path] || {}), ...item };
              }
            });
            currentState.setFileMetadata(next);
          })
          .catch(() => { });
      }

      if (typeof api.probeDurationsForFiles === "function") {
        api
          .probeDurationsForFiles(addedList)
          .then((result) => {
            if (!Array.isArray(result)) return;
            const map = { ...(durationsRef.current || {}) };
            result.forEach((item) => {
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
            usePlayerStore.getState().setDurations({ ...map });
          })
          .catch(() => { });
      }
    });

    return () => {
      try {
        if (typeof unsubscribe === "function") unsubscribe();
      } catch (e) { }
    };
  }, [currentFolderPath, durationsRef, ffprobeAttemptsRef]);
}
