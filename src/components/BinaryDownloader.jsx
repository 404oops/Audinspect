import { useState, useEffect, useCallback } from "react";
import { Download, AlertCircle, Loader2 } from "lucide-react";

// component that checks and downloads ffmpeg and ffprobe binaries on first launch
export default function BinaryDownloader({ onReady, onError }) {
  const [status, setStatus] = useState("checking"); // checking | downloading | ready | error
  const [progress, setProgress] = useState({
    binary: null,
    percent: 0,
    downloaded: 0,
    total: 0,
  });
  const [error, setError] = useState(null);

  const checkAndDownload = useCallback(async () => {
    try {
      // check if binaries are already available
      const binStatus = await window.electronAPI.getBinariesStatus();

      if (binStatus.available) {
        setStatus("ready");
        onReady?.();
        return;
      }

      // need to download
      setStatus("downloading");

      // set up progress listener
      const unsubscribe = window.electronAPI.onBinariesDownloadProgress(
        (data) => {
          setProgress({
            binary: data.binary,
            percent: data.percent,
            downloaded: data.downloaded,
            total: data.total,
          });
        }
      );

      // trigger download
      const result = await window.electronAPI.downloadBinaries();

      unsubscribe();

      if (result.success) {
        setStatus("ready");
        onReady?.();
      } else {
        setStatus("error");
        setError(result.error || "download failed");
        onError?.(result.error);
      }
    } catch (e) {
      console.error("binary download error:", e);
      setStatus("error");
      setError(e.message || "unknown error");
      onError?.(e.message);
    }
  }, [onReady, onError]);

  useEffect(() => {
    checkAndDownload();
  }, [checkAndDownload]);

  // don't render anything if ready
  if (status === "ready") {
    return null;
  }

  const formatBytes = (bytes) => {
    if (!bytes) return "0 mb";
    return (bytes / 1024 / 1024).toFixed(1) + " mb";
  };

  return (
    <div className="fixed inset-0 bg-pure-black/70 flex items-center justify-center z-50">
      <div className="bg-pure-black border-2 border-white max-w-lg w-full mx-24 p-24 space-y-16">
        {status === "checking" && (
          <div className="flex items-center gap-12">
            <div className="w-32 h-32 flex items-center justify-center border-2 border-white/40">
              <Loader2 className="w-6 h-6 text-[var(--accent-color)] animate-spin" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white mb-4">
                checking audio engine
              </div>
              <div className="text-sm text-white/60">
                verifying ffmpeg and ffprobe so playback works across formats
              </div>
            </div>
          </div>
        )}

        {status === "downloading" && (
          <div className="space-y-12">
            <div className="flex items-center gap-12">
              <div className="w-32 h-32 flex items-center justify-center border-2 border-white/40">
                <Download className="w-6 h-6 text-[var(--accent-color)]" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white mb-4">
                  first time setup
                </div>
                <div className="text-sm text-white/60">
                  downloading ffmpeg and ffprobe so audinspect can decode more audio formats
                </div>
              </div>
            </div>

            {progress.binary && (
              <div className="mb-8 text-sm text-white/80">
                <span className="font-medium">{progress.binary}</span>
                {progress.total && (
                  <span className="text-white/50 ml-4">
                    ({formatBytes(progress.downloaded)} / {formatBytes(progress.total)})
                  </span>
                )}
              </div>
            )}

            <div className="w-full h-2 bg-white/10">
              <div
                className="h-full bg-[var(--accent-color)] transition-all duration-300"
                style={{ width: `${progress.percent || 0}%` }}
              />
            </div>

            <div className="text-xs text-white/40">
              this is a one time download and will be cached on disk
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-12">
            <div className="flex items-center gap-12">
              <div className="w-32 h-32 flex items-center justify-center border-2 border-red-500/60">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white mb-4">
                  download failed
                </div>
                <div className="text-sm text-white/60">
                  {error || "failed to download required components"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-8 mt-8">
              <button
                type="button"
                onClick={checkAndDownload}
                className="flex flex-row items-center gap-8 bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-16 py-8 no-drag whitespace-nowrap"
              >
                retry download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
