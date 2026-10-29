import { useEffect } from "react";
import platform from "../platform";
import usePlayerStore from "../store/usePlayerStore";
import {
  initMetadataClient,
  saveMetadataFromStatResults,
} from "../utils/metadataClient";

const currentMetadata = () => {
  const { fileMetadata } = usePlayerStore.getState();
  return fileMetadata && typeof fileMetadata === "object" ? fileMetadata : {};
};

const mergeMetadata = (base, items) => {
  const next = { ...base };
  items.forEach((item) => {
    if (item && item.path) {
      next[item.path] = { ...(next[item.path] || {}), ...item };
    }
  });
  return next;
};

// size / mtime / type for every file in the playlist, plus live updates
// from the folder watcher. results are persisted through the metadata worker.
export function useFileMetadata(files) {
  const setFileMetadata = usePlayerStore((s) => s.setFileMetadata);

  useEffect(() => {
    try {
      initMetadataClient().catch(() => { });
    } catch (e) { }
  }, []);

  useEffect(() => {
    const api = platform;
    if (!api || typeof api.getFileMetadata !== "function") return undefined;
    let cancelled = false;

    const loadMetadata = async () => {
      const uniquePaths = [...new Set((files || []).filter(Boolean))];
      if (!uniquePaths.length) {
        if (Object.keys(currentMetadata()).length) setFileMetadata({});
        return;
      }
      try {
        const baseMeta = currentMetadata();
        const missing = uniquePaths.filter((p) => {
          const meta = baseMeta[p];
          if (!meta) return true;
          return (
            typeof meta.size !== "number" &&
            typeof meta.mtimeMs !== "number" &&
            !meta.mtimeIso &&
            !meta.type
          );
        });
        if (!missing.length) return;

        const result = await api.getFileMetadata(missing);
        if (cancelled) return;
        if (!Array.isArray(result) || !result.length) return;
        setFileMetadata(mergeMetadata(currentMetadata(), result));

        try {
          await saveMetadataFromStatResults(result);
        } catch (e) { }
      } catch (e) {
        console.warn("Failed to load file metadata:", e);
      }
    };

    loadMetadata();
    return () => {
      cancelled = true;
    };
  }, [files, setFileMetadata]);

  useEffect(() => {
    const api = platform;
    if (!api || typeof api.onFilesMetadataDelta !== "function") return undefined;

    const unsubscribe = api.onFilesMetadataDelta((items) => {
      if (!Array.isArray(items) || !items.length) return;
      const state = usePlayerStore.getState();
      const filesSet = new Set(Array.isArray(state.files) ? state.files : []);
      const relevant = items.filter(
        (item) => item && item.path && filesSet.has(item.path)
      );
      if (relevant.length) {
        state.setFileMetadata(mergeMetadata(currentMetadata(), relevant));
      }
      try {
        saveMetadataFromStatResults(items);
      } catch (e) { }
    });

    return () => {
      try {
        if (typeof unsubscribe === "function") unsubscribe();
      } catch (e) { }
    };
  }, []);
}
