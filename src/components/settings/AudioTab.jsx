import { useState, useEffect } from "react";
import { RefreshCw, Download, FolderSearch, Trash } from "lucide-react";
import usePlayerStore from "../../store/usePlayerStore";
import Dropdown from "./Dropdown";
import BinaryRow from "./BinaryRow";
import useAudioEngine from "./useAudioEngine";

const formatMB = (bytes) => `${((bytes || 0) / 1024 / 1024).toFixed(1)} MB`;

const ACTION_BUTTON =
  "flex items-center gap-4 bg-pure-black border-2 border-white hover:bg-white hover:text-pure-black text-white text-xs px-8 py-[0.5rem] no-drag disabled:opacity-50";
const QUIET_BUTTON =
  "flex items-center gap-4 bg-pure-black border-2 border-white/40 hover:border-white text-white text-xs px-8 py-[0.5rem] no-drag disabled:opacity-50";
const ACCENT_BUTTON =
  "flex items-center gap-4 bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white text-xs px-8 py-[0.5rem] no-drag disabled:opacity-50";

function OutputDeviceSection() {
  const audioOutputDevice = usePlayerStore((state) => state.audioOutputDevice);
  const setAudioOutputDevice = usePlayerStore(
    (state) => state.setAudioOutputDevice
  );
  const [audioDevices, setAudioDevices] = useState([]);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (!active) return;
        const audioOutputs = devices.filter(
          (device) => device.kind === "audiooutput"
        );
        setAudioDevices(audioOutputs);
        // if no device is selected yet, default to the first one
        if (
          audioOutputs.length > 0 &&
          !usePlayerStore.getState().audioOutputDevice
        ) {
          setAudioOutputDevice(audioOutputs[0].deviceId);
        }
      })
      .catch((error) => {
        console.error("Error loading audio devices:", error);
      });
    return () => {
      active = false;
    };
  }, [setAudioOutputDevice]);

  const options = audioDevices.map((device, idx) => ({
    value: device.deviceId,
    label: device.label || `audio output ${idx + 1}`,
  }));

  return (
    <div>
      <h3
        id="audio-output-label"
        className="text-sm font-bold text-white mb-16 uppercase tracking-wider"
      >
        Audio Output Device
      </h3>

      {options.length > 0 ? (
        <Dropdown
          value={audioOutputDevice}
          options={options}
          onChange={setAudioOutputDevice}
          fallbackLabel="Select device"
          labelledBy="audio-output-label"
          containerClassName="relative w-full"
          buttonClassName="w-full bg-pure-black text-white border-2 border-white text-xs px-8 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-colors text-left flex items-center justify-between"
          menuClassName="absolute left-0 mt-2 w-full bg-pure-black border-2 border-white shadow-lg z-50 max-h-[200px] overflow-y-auto"
          labelClassName="truncate"
          chevronClassName="text-white/70 flex-shrink-0 ml-2"
          itemLabelClassName="truncate"
        />
      ) : (
        <div className="text-white/60">
          No audio output devices found. This may require microphone
          permissions to enumerate devices.
        </div>
      )}

      <p className="mt-16 text-sm text-white/40">
        Note: audio output switching may not be supported on all
        systems. changes will apply to the next track if not supported
        immediately.
      </p>
    </div>
  );
}

function EngineActions({ engine }) {
  const { binStatus, engineBusy } = engine;
  const hasCustomPaths = !!(
    binStatus?.customFfmpegPath || binStatus?.customFfprobePath
  );
  const canDownload = !binStatus?.ffmpeg?.path && !!binStatus?.downloadSupported;
  return (
    <div className="flex flex-wrap gap-8 mt-16">
      <button type="button" disabled={engineBusy} onClick={engine.redetect} className={ACTION_BUTTON}>
        <RefreshCw size={14} strokeWidth={2} />
        detect again
      </button>
      <button type="button" disabled={engineBusy} onClick={() => engine.locate("ffmpeg")} className={ACTION_BUTTON}>
        <FolderSearch size={14} strokeWidth={2} />
        locate ffmpeg…
      </button>
      <button type="button" disabled={engineBusy} onClick={() => engine.locate("ffprobe")} className={ACTION_BUTTON}>
        <FolderSearch size={14} strokeWidth={2} />
        locate ffprobe…
      </button>
      {hasCustomPaths && (
        <button type="button" disabled={engineBusy} onClick={engine.useDetected} className={QUIET_BUTTON}>
          forget custom paths
        </button>
      )}
      {canDownload && (
        <button type="button" disabled={engineBusy} onClick={engine.download} className={ACCENT_BUTTON}>
          <Download size={14} strokeWidth={2} />
          download ffmpeg
        </button>
      )}
      {binStatus?.hasDownloaded && (
        <button type="button" disabled={engineBusy} onClick={engine.removeDownloaded} className={QUIET_BUTTON}>
          <Trash size={14} strokeWidth={2} />
          remove downloaded ({formatMB(binStatus.downloadedBytes)})
        </button>
      )}
    </div>
  );
}

function InvalidPathNotice({ kind, entry, path }) {
  if (!entry?.customInvalid) return null;
  return (
    <p className="mt-8 text-sm text-red-400">
      the custom {kind} path ({path}) does not run.
    </p>
  );
}

function AudioEngineSection({ engine }) {
  const { binStatus, downloadProgress, engineMessage } = engine;
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Audio Engine
      </h3>
      <div className="space-y-12 text-sm">
        <BinaryRow kind="ffmpeg" entry={binStatus?.ffmpeg} required />
        <BinaryRow kind="ffprobe" entry={binStatus?.ffprobe} />
      </div>
      <p className="mt-8 text-sm text-white/40">
        ffmpeg decodes formats the browser can't play (aac, m4a, opus,
        aiff, wma, …). ffprobe is optional: without it ffmpeg reads
        track lengths itself. system installs (brew, apt, winget,
        choco, scoop, PATH) are detected automatically.
      </p>
      <InvalidPathNotice kind="ffmpeg" entry={binStatus?.ffmpeg} path={binStatus?.customFfmpegPath} />
      <InvalidPathNotice kind="ffprobe" entry={binStatus?.ffprobe} path={binStatus?.customFfprobePath} />
      <EngineActions engine={engine} />
      {downloadProgress && (
        <div className="mt-12">
          <div className="w-full h-2 bg-white/10">
            <div
              className="h-full bg-[var(--accent-color)] transition-colors duration-300"
              style={{ width: `${downloadProgress.percent || 0}%` }}
            />
          </div>
          <div className="mt-4 text-xs text-white/50">
            {formatMB(downloadProgress.downloaded)} /{" "}
            {formatMB(downloadProgress.total)}
          </div>
        </div>
      )}
      {engineMessage && (
        <p
          className={`mt-12 text-sm break-words ${engineMessage.kind === "error" ? "text-red-400" : "text-white/70"}`}
        >
          {engineMessage.text}
        </p>
      )}
    </div>
  );
}

function StorageSection({ engine }) {
  const { cacheInfo, engineBusy, maxCacheInput, setMaxCacheInput } = engine;
  const importsCount = cacheInfo?.importsCount;
  const maxMB = cacheInfo?.maxBytes
    ? Math.round(cacheInfo.maxBytes / 1024 / 1024)
    : "–";
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Storage
      </h3>
      <div className="text-sm text-white/70 space-y-4">
        <div className="flex items-center justify-between gap-16">
          <span>downloaded ffmpeg</span>
          <span className="font-mono">{formatMB(cacheInfo?.binariesBytes)}</span>
        </div>
        <div className="flex items-center justify-between gap-16">
          <span>
            imported file copies
            {importsCount ? ` (${importsCount})` : ""}
          </span>
          <span className="font-mono">{formatMB(cacheInfo?.importsBytes)}</span>
        </div>
        <div className="flex items-center justify-between gap-16 border-t border-white/20 pt-4 text-white">
          <span>total</span>
          <span className="font-mono">
            {formatMB(cacheInfo?.totalBytes)} / {maxMB} MB
          </span>
        </div>
      </div>
      <div className="flex items-center gap-16 mt-16">
        <label
          htmlFor="cache-limit"
          className="block text-14 font-medium whitespace-nowrap"
        >
          Cache limit
        </label>
        <input
          id="cache-limit"
          type="number"
          min={10}
          step={10}
          value={maxCacheInput}
          onChange={(e) => setMaxCacheInput(e.target.value)}
          onBlur={engine.commitMaxCache}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.target.blur();
            }
          }}
          className="w-[110px] bg-pure-black text-white border-2 border-white text-xs px-8 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-colors text-right font-mono"
        />
        <span className="text-sm text-white/60">MB</span>
      </div>
      <p className="mt-8 text-sm text-white/40">
        Caps what audinspect keeps on disk: the downloaded ffmpeg plus
        temporary copies of files dropped in from places that aren't
        on disk. Oldest copies go first; ffmpeg is never removed
        automatically, and a download that wouldn't fit is refused.
      </p>
      <div className="flex flex-wrap gap-8 mt-16">
        <button
          type="button"
          disabled={engineBusy || !cacheInfo?.importsBytes}
          onClick={engine.clearImports}
          className={ACTION_BUTTON}
        >
          <Trash size={14} strokeWidth={2} />
          clear imported copies
        </button>
      </div>
    </div>
  );
}

export default function AudioTab() {
  const engine = useAudioEngine();
  return (
    <div className="space-y-24">
      <OutputDeviceSection />
      <AudioEngineSection engine={engine} />
      <StorageSection engine={engine} />
    </div>
  );
}
