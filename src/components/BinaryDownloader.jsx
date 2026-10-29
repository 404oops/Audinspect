import { useState, useEffect, useCallback, useRef } from "react";
import { Download, CircleAlert, LoaderCircle, FolderSearch } from "lucide-react";

const formatMB = (bytes) =>
  bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : null;

// first-launch check for ffmpeg. a system install (homebrew, apt, winget,
// chocolatey, scoop, PATH) is picked up automatically; only when nothing is
// found does this ask before downloading anything.
export default function BinaryDownloader({ onReady, onError }) {
  const [status, setStatus] = useState("checking"); // checking | prompt | downloading | ready | error
  const [downloadSize, setDownloadSize] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, downloaded: 0, total: 0 });
  const [error, setError] = useState(null);
  const [maxCacheMB, setMaxCacheMB] = useState(null);
  const readyFired = useRef(false);

  const finish = useCallback(() => {
    setStatus("ready");
    if (!readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }
  }, [onReady]);

  const check = useCallback(async () => {
    try {
      const binStatus = await window.electronAPI.getBinariesStatus();
      if (binStatus?.maxCacheMB) setMaxCacheMB(binStatus.maxCacheMB);
      if (binStatus?.available || binStatus?.promptDismissed) {
        finish();
        return;
      }
      setStatus("prompt");
      window.electronAPI
        .getBinariesDownloadSize()
        .then((size) => setDownloadSize(size || null))
        .catch(() => {});
    } catch (e) {
      console.error("binary status check failed:", e);
      // never trap the user behind this dialog
      finish();
    }
  }, [finish]);

  useEffect(() => {
    check();
  }, [check]);

  const download = useCallback(async () => {
    setStatus("downloading");
    setError(null);
    setProgress({ percent: 0, downloaded: 0, total: downloadSize || 0 });
    const unsubscribe = window.electronAPI.onBinariesDownloadProgress((data) => {
      setProgress({
        percent: data.percent,
        downloaded: data.downloaded,
        total: data.total,
      });
    });
    try {
      const result = await window.electronAPI.downloadBinaries();
      if (result?.success) {
        finish();
      } else {
        setStatus("error");
        setError(result?.error || "download failed");
        onError?.(result?.error);
      }
    } catch (e) {
      setStatus("error");
      setError(e.message || "unknown error");
      onError?.(e.message);
    } finally {
      unsubscribe();
    }
  }, [downloadSize, finish, onError]);

  const locate = useCallback(async () => {
    try {
      const res = await window.electronAPI.browseForBinary("ffmpeg");
      if (res?.ok) {
        finish();
      } else if (res?.error) {
        setStatus("error");
        setError(res.error);
      }
    } catch (e) {
      setStatus("error");
      setError(e.message || "unknown error");
    }
  }, [finish]);

  const skip = useCallback(
    async (forever) => {
      if (forever) {
        try {
          await window.electronAPI.dismissBinariesPrompt(true);
        } catch (e) {}
      }
      finish();
    },
    [finish]
  );

  if (status === "ready") {
    return null;
  }

  const primaryButton =
    "flex flex-row items-center gap-8 bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-16 py-8 no-drag whitespace-nowrap";
  const secondaryButton =
    "flex flex-row items-center gap-8 bg-pure-black border-2 border-white hover:bg-white hover:text-pure-black text-white px-16 py-8 no-drag whitespace-nowrap";
  const quietButton =
    "flex flex-row items-center gap-8 bg-pure-black border-2 border-white/40 hover:border-white text-white px-16 py-8 no-drag whitespace-nowrap";

  return (
    <div className="fixed inset-0 bg-pure-black/70 flex items-center justify-center z-50">
      <div className="bg-pure-black border-2 border-white max-w-lg w-full mx-24 p-24 space-y-16">
        {status === "checking" && (
          <div className="flex items-center gap-12">
            <div className="w-32 h-32 flex items-center justify-center border-2 border-white/40">
              <LoaderCircle className="w-6 h-6 text-[var(--accent-color)] animate-spin" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white mb-4">
                checking audio engine
              </div>
              <div className="text-sm text-white/60">
                looking for ffmpeg on this system
              </div>
            </div>
          </div>
        )}

        {status === "prompt" && (
          <div className="space-y-12">
            <div className="flex items-center gap-12">
              <div className="w-32 h-32 flex items-center justify-center border-2 border-white/40">
                <Download className="w-6 h-6 text-[var(--accent-color)]" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white mb-4">
                  ffmpeg not found
                </div>
                <div className="text-sm text-white/60">
                  wav, mp3, flac and ogg play without it. everything else (aac,
                  m4a, opus, aiff, wma, …) needs ffmpeg to decode.
                </div>
              </div>
            </div>
            <div className="text-xs text-white/40">
              already have it? install it with your package manager (brew, apt,
              winget, choco, scoop) or point audinspect at the binary. the
              download goes into audinspect's cache
              {maxCacheMB ? ` (limit ${maxCacheMB} MB, adjustable in settings)` : ""}.
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <button type="button" onClick={download} className={primaryButton}>
                <Download size={16} strokeWidth={2} />
                download ffmpeg{downloadSize ? ` (${formatMB(downloadSize)})` : ""}
              </button>
              <button type="button" onClick={locate} className={secondaryButton}>
                <FolderSearch size={16} strokeWidth={2} />
                locate ffmpeg…
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <button type="button" onClick={() => skip(false)} className={quietButton}>
                skip for now
              </button>
              <button type="button" onClick={() => skip(true)} className={quietButton}>
                skip and don't ask again
              </button>
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
                  downloading ffmpeg
                </div>
                <div className="text-sm text-white/60">
                  {progress.total
                    ? `${formatMB(progress.downloaded)} / ${formatMB(progress.total)}`
                    : "starting…"}
                </div>
              </div>
            </div>

            <div className="w-full h-2 bg-white/10">
              <div
                className="h-full bg-[var(--accent-color)] transition-colors duration-300"
                style={{ width: `${progress.percent || 0}%` }}
              />
            </div>

            <div className="text-xs text-white/40">
              one time download, kept in audinspect's cache folder. you can
              remove it again from settings &gt; audio.
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-12">
            <div className="flex items-center gap-12">
              <div className="w-32 h-32 flex items-center justify-center border-2 border-red-500/60">
                <CircleAlert className="w-6 h-6 text-red-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-white mb-4">
                  ffmpeg setup failed
                </div>
                <div className="text-sm text-white/60 break-words">
                  {error || "failed to set up ffmpeg"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-8">
              <button type="button" onClick={download} className={primaryButton}>
                retry download
              </button>
              <button type="button" onClick={locate} className={secondaryButton}>
                locate ffmpeg…
              </button>
              <button type="button" onClick={() => skip(false)} className={quietButton}>
                skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
