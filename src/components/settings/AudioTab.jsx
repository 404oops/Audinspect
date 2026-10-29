import { useState, useEffect, useCallback } from "react";
import { Trash, RefreshCw } from "lucide-react";
import usePlayerStore from "../../store/usePlayerStore";
import Dropdown from "./Dropdown";
import { describeDecoderSupport, ENGINE_LABELS } from "../../audio/decoderSupport";
import {
  getMetadataCacheStats,
  clearMetadataCache,
} from "../../utils/metadataClient";

const ACTION_BUTTON =
  "flex items-center gap-4 bg-pure-black border-2 border-white hover:bg-white hover:text-pure-black text-white text-xs px-8 py-[0.5rem] disabled:opacity-50";

function OutputDeviceSection() {
  const audioOutputDevice = usePlayerStore((state) => state.audioOutputDevice);
  const setAudioOutputDevice = usePlayerStore(
    (state) => state.setAudioOutputDevice
  );
  const [audioDevices, setAudioDevices] = useState([]);

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.enumerateDevices) return undefined;
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
          buttonClassName="w-full bg-pure-black text-white border-2 border-white text-xs px-8 py-[0.5rem] focus:outline-none focus:border-[var(--accent-color)] transition-colors text-left flex items-center justify-between"
          menuClassName="absolute left-0 mt-2 w-full bg-pure-black border-2 border-white shadow-lg z-50 max-h-[200px] overflow-y-auto"
          labelClassName="truncate"
          chevronClassName="text-white/70 flex-shrink-0 ml-2"
          itemLabelClassName="truncate"
        />
      ) : (
        <div className="text-white/60">
          No audio output devices found. The browser only lists outputs after
          microphone permission has been granted, and not every browser
          supports switching.
        </div>
      )}

      <p className="mt-16 text-sm text-white/40">
        Note: audio output switching may not be supported in every browser.
        Changes apply to the next track if not supported immediately.
      </p>
    </div>
  );
}

const ENGINE_BADGE = {
  native: "border-white/40 text-white",
  mediabunny: "border-[var(--accent-color)] text-white",
  "audio-decode": "border-[var(--accent-color)] text-white",
  none: "border-red-500/60 text-red-400",
};

function DecodersSection() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    describeDecoderSupport()
      .then((result) => {
        if (active) setRows(result);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Decoders
      </h3>
      <p className="text-sm text-white/40 mb-12">
        Everything is decoded in the browser. Formats the browser plays on its
        own are handed straight to the player; mediabunny decodes the rest
        through WebCodecs, and @audio/decode's WebAssembly codecs cover the
        exotic ones (aiff, wma, ac3, dts, amr, ape, wavpack, dsd, …).
      </p>
      {rows === null ? (
        <div className="text-sm text-white/60">checking…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-4 text-sm">
          {rows.map(({ ext, engine }) => (
            <div key={ext} className="flex items-center justify-between gap-8 min-w-0">
              <span className="font-mono text-white">{ext}</span>
              <span
                className={`text-[11px] px-8 py-[2px] border whitespace-nowrap truncate ${ENGINE_BADGE[engine]}`}
                title={ENGINE_LABELS[engine]}
              >
                {ENGINE_LABELS[engine]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CacheSection() {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const refresh = useCallback(async (isActive = () => true) => {
    const next = await getMetadataCacheStats();
    if (isActive()) setStats(next);
  }, []);

  useEffect(() => {
    let active = true;
    refresh(() => active);
    return () => {
      active = false;
    };
  }, [refresh]);

  const clear = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await clearMetadataCache();
      setMessage({ kind: "ok", text: "cached track info removed" });
    } catch (e) {
      setMessage({ kind: "error", text: e.message || String(e) });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Storage
      </h3>
      <div className="text-sm text-white/70 flex items-center justify-between gap-16">
        <span>cached track lengths and dates</span>
        <span className="font-mono">
          {stats ? `${stats.tracks} ${stats.tracks === 1 ? "track" : "tracks"}` : "–"}
        </span>
      </div>
      <p className="mt-8 text-sm text-white/40">
        Track lengths are kept in the browser's own storage so a folder you
        have seen before lists instantly. Files dropped in from outside
        Puter stay in memory only and are gone when the app closes; nothing
        is written to your Puter drive.
      </p>
      <div className="flex flex-wrap gap-8 mt-16">
        <button
          type="button"
          disabled={busy || !stats?.tracks}
          onClick={clear}
          className={ACTION_BUTTON}
        >
          <Trash size={14} strokeWidth={2} />
          clear cached track info
        </button>
        <button type="button" disabled={busy} onClick={() => refresh()} className={ACTION_BUTTON}>
          <RefreshCw size={14} strokeWidth={2} />
          refresh
        </button>
      </div>
      {message && (
        <p
          className={`mt-12 text-sm break-words ${message.kind === "error" ? "text-red-400" : "text-white/70"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export default function AudioTab() {
  return (
    <div className="space-y-24">
      <OutputDeviceSection />
      <DecodersSection />
      <CacheSection />
    </div>
  );
}
