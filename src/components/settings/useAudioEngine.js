import { useState, useEffect, useCallback } from "react";

// ffmpeg / ffprobe status, cache usage and the actions in settings > audio
export default function useAudioEngine() {
  const [binStatus, setBinStatus] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [maxCacheInput, setMaxCacheInput] = useState("");
  const [engineMessage, setEngineMessage] = useState(null);
  const [engineBusy, setEngineBusy] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  // isActive lets an effect drop results that arrive after it was cleaned up
  const refresh = useCallback(async (isActive = () => true) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      const [status, info] = await Promise.all([
        api.getBinariesStatus(),
        api.getCacheInfo(),
      ]);
      if (!isActive()) return;
      setBinStatus(status || null);
      setCacheInfo(info || null);
      if (info && info.maxBytes) {
        setMaxCacheInput(String(Math.round(info.maxBytes / 1024 / 1024)));
      }
    } catch (e) {
      console.warn("failed to load audio engine status:", e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    refresh(() => active);
    return () => {
      active = false;
    };
  }, [refresh]);

  const runAction = useCallback(
    async (fn, successMessage) => {
      setEngineBusy(true);
      setEngineMessage(null);
      try {
        const result = await fn();
        if (result === null) return; // cancelled, nothing to report
        if (result && result.error) {
          setEngineMessage({ kind: "error", text: result.error });
        } else if (successMessage) {
          setEngineMessage({ kind: "ok", text: successMessage });
        }
      } catch (e) {
        setEngineMessage({ kind: "error", text: e.message || String(e) });
      } finally {
        setEngineBusy(false);
        refresh();
      }
    },
    [refresh]
  );

  const redetect = () =>
    runAction(() => window.electronAPI.redetectBinaries(), "detection done");

  const locate = (kind) =>
    runAction(async () => {
      const res = await window.electronAPI.browseForBinary(kind);
      if (res && res.canceled) return null;
      return res;
    }, `${kind} path saved`);

  const useDetected = () =>
    runAction(
      () => window.electronAPI.setSettings({ ffmpegPath: "", ffprobePath: "" }),
      "using auto-detected binaries"
    );

  const download = () =>
    runAction(async () => {
      const unsubscribe = window.electronAPI.onBinariesDownloadProgress((d) =>
        setDownloadProgress(d)
      );
      try {
        return await window.electronAPI.downloadBinaries();
      } finally {
        unsubscribe();
        setDownloadProgress(null);
      }
    }, "ffmpeg downloaded");

  const removeDownloaded = () =>
    runAction(
      () => window.electronAPI.removeDownloadedBinaries(),
      "downloaded binaries removed"
    );

  const clearImports = () =>
    runAction(
      () => window.electronAPI.clearImportCache(),
      "imported copies removed"
    );

  const commitMaxCache = () => {
    const mb = parseInt(maxCacheInput, 10);
    if (!Number.isFinite(mb)) {
      refresh();
      return;
    }
    runAction(() => window.electronAPI.setSettings({ maxCacheMB: mb }), null);
  };

  return {
    binStatus,
    cacheInfo,
    maxCacheInput,
    setMaxCacheInput,
    engineMessage,
    engineBusy,
    downloadProgress,
    redetect,
    locate,
    useDetected,
    download,
    removeDownloaded,
    clearImports,
    commitMaxCache,
  };
}
