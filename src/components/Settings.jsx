import { useState, useEffect } from "react";
import {
  X,
  Palette,
  Volume2,
  Settings2,
  Check,
  ChevronDown,
} from "lucide-react";
import usePlayerStore from "../store/usePlayerStore";

const PRESET_COLORS = [
  { name: "International Blue", value: "#0050ff" },
  { name: "Purple", value: "#a855f7" },
  { name: "Green", value: "#10b981" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Yellow", value: "#eab308" },
];

export default function Settings({ isOpen, onClose }) {
  const accentColor = usePlayerStore((state) => state.accentColor);
  const setAccentColor = usePlayerStore((state) => state.setAccentColor);
  const nudgeAmount = usePlayerStore((state) => state.nudgeAmount);
  const setNudgeAmount = usePlayerStore((state) => state.setNudgeAmount);
  const wavesurferTheme = usePlayerStore((state) => state.wavesurferTheme);
  const setWavesurferTheme = usePlayerStore(
    (state) => state.setWavesurferTheme
  );
  const wavesurferShowHover = usePlayerStore(
    (state) => state.wavesurferShowHover
  );
  const setWavesurferShowHover = usePlayerStore(
    (state) => state.setWavesurferShowHover
  );
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [activeTab, setActiveTab] = useState("general");
  const [rememberLastFolder, setRememberLastFolder] = useState(false);
  const [rememberLastSortMode, setRememberLastSortMode] = useState(false);
  const [sortModeScope, setSortModeScope] = useState("global");

  const selectThemeClass = {
    precision:
      "bg-pure-black text-white border-2 border-white focus:border-[var(--accent-color)]",
    prettiness:
      "bg-gradient-to-r from-[var(--accent-color)]/20 via-pink-500/25 to-purple-500/20 text-white border-2 border-[var(--accent-color)]/60 hover:border-[var(--accent-color)] focus:border-[var(--accent-color)]",
    minimal:
      "bg-pure-black/85 text-white/85 border border-white/30 hover:border-white/60 focus:border-[var(--accent-color)] text-sm",
  };

  const chevronThemeClass = {
    precision: "text-white/70",
    prettiness: "text-white",
    minimal: "text-white/60",
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadAudioDevices();

      const handleEscape = (e) => {
        if (e.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", handleEscape);

      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen, onClose]);

  const loadSettings = () => {
    const savedDevice = localStorage.getItem("audioOutputDevice");
    if (savedDevice) {
      setSelectedDevice(savedDevice);
    }

    const savedRememberLastFolder = localStorage.getItem("rememberLastFolder");
    setRememberLastFolder(savedRememberLastFolder === "true");

    const savedRememberLastSortMode = localStorage.getItem(
      "rememberLastSortMode"
    );
    setRememberLastSortMode(savedRememberLastSortMode === "true");

    const savedSortModeScope = localStorage.getItem("sortModeScope");
    if (savedSortModeScope === "perFolder" || savedSortModeScope === "global") {
      setSortModeScope(savedSortModeScope);
    }
  };

  const loadAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(
        (device) => device.kind === "audiooutput"
      );
      setAudioDevices(audioOutputs);

      if (audioOutputs.length > 0 && !selectedDevice) {
        setSelectedDevice(audioOutputs[0].deviceId);
      }
    } catch (error) {
      console.error("Error loading audio devices:", error);
    }
  };

  const handleColorChange = (color) => {
    setAccentColor(color);
    document.documentElement.style.setProperty("--accent-color", color);
    localStorage.setItem("accentColor", color);
  };

  const handleDeviceChange = async (deviceId) => {
    setSelectedDevice(deviceId);
    localStorage.setItem("audioOutputDevice", deviceId);

    const audioElement = document.querySelector("audio");
    if (audioElement && typeof audioElement.setSinkId === "function") {
      try {
        await audioElement.setSinkId(deviceId);
      } catch (error) {
        console.error("Error setting audio output device:", error);
      }
    }

    try {
      if (
        window.wavesurfer &&
        typeof window.wavesurfer.setSinkId === "function"
      ) {
        await window.wavesurfer.setSinkId(deviceId);
      }
    } catch (error) {
      console.error("Error setting WaveSurfer audio output device:", error);
    }
  };

  const handleCustomColorChange = (e) => {
    const color = e.target.value;
    handleColorChange(color);
  };

  const handleRememberLastFolderChange = (enabled) => {
    setRememberLastFolder(enabled);
    localStorage.setItem("rememberLastFolder", enabled ? "true" : "false");
    if (!enabled) {
      localStorage.removeItem("lastOpenedFolder");
    }
  };

  const handleRememberLastSortModeChange = (enabled) => {
    setRememberLastSortMode(enabled);
    localStorage.setItem("rememberLastSortMode", enabled ? "true" : "false");
  };

  const handleSortModeScopeChange = (scope) => {
    if (scope !== "global" && scope !== "perFolder") return;
    setSortModeScope(scope);
    localStorage.setItem("sortModeScope", scope);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-pure-black/70 flex items-center justify-center z-50">
      <div
        className="bg-pure-black border-2 border-white w-full max-w-2xl mx-24 flex flex-col h-[485px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {}
        <div className="flex items-center justify-between p-24 border-b-2 border-white">
          <h2 id="settings-title" className="text-xl font-bold text-white">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="bg-pure-black border-2 border-white hover:bg-white hover:text-pure-black text-white p-4 transition-all duration-200"
            aria-label="Close settings"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {}
        <div className="flex border-b-2 border-white">
          <button
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-8 px-16 py-8 text-white transition-all duration-200 border-r-2 border-white ${
              activeTab === "general"
                ? "bg-[var(--accent-color)]"
                : "bg-pure-black hover:bg-white/10"
            }`}
          >
            <Settings2 size={16} strokeWidth={2} />
            <span>General</span>
          </button>
          <button
            onClick={() => setActiveTab("appearance")}
            className={`flex items-center gap-8 px-16 py-8 text-white transition-all duration-200 border-r-2 border-white ${
              activeTab === "appearance"
                ? "bg-[var(--accent-color)]"
                : "bg-pure-black hover:bg-white/10"
            }`}
          >
            <Palette size={16} strokeWidth={2} />
            <span>Appearance</span>
          </button>
          <button
            onClick={() => setActiveTab("audio")}
            className={`flex items-center gap-8 px-16 py-8 text-white transition-all duration-200 ${
              activeTab === "audio"
                ? "bg-[var(--accent-color)]"
                : "bg-pure-black hover:bg-white/10"
            }`}
          >
            <Volume2 size={16} strokeWidth={2} />
            <span>Audio</span>
          </button>
        </div>

        {}
        <div className="flex-1 p-24 overflow-y-auto">
          {activeTab === "general" && (
            <div className="space-y-24">
              <div>
                <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
                  Startup
                </h3>

                <label className="flex items-center gap-5 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberLastFolder}
                      onChange={(e) =>
                        handleRememberLastFolderChange(e.target.checked)
                      }
                      className="sr-only"
                    />
                    <div
                      className={`size-6 border-2 transition-all duration-200 ${
                        rememberLastFolder
                          ? "bg-[var(--accent-color)] border-[var(--accent-color)]"
                          : "bg-pure-black border-white/40 group-hover:border-white"
                      }`}
                    >
                      {rememberLastFolder && (
                        <Check size={20} strokeWidth={2} />
                      )}
                    </div>
                  </div>
                  <span className="text-white">
                    Open to last folder on startup
                  </span>
                </label>

                <p className="mt-[1rem] text-sm text-white/40">
                  When enabled, audinspect will automatically open the last
                  folder you had open when you start the app.
                </p>

                <div className="mt-24">
                  <label className="flex items-center gap-5 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={rememberLastSortMode}
                        onChange={(e) =>
                          handleRememberLastSortModeChange(e.target.checked)
                        }
                        className="sr-only"
                      />
                      <div
                        className={`size-6 border-2 transition-all duration-200 ${
                          rememberLastSortMode
                            ? "bg-[var(--accent-color)] border-[var(--accent-color)]"
                            : "bg-pure-black border-white/40 group-hover:border-white"
                        }`}
                      >
                        {rememberLastSortMode && (
                          <Check size={20} strokeWidth={2} />
                        )}
                      </div>
                    </div>
                    <span className="text-white">
                      Remember last sorting option
                    </span>
                  </label>
                  <p className="mt-[1rem] text-sm text-white/40">
                    When enabled, audinspect will remember and restore your last
                    playlist sorting mode on startup.
                  </p>

                  {rememberLastSortMode && (
                    <div className="mt-16 space-y-8">
                      <div className="text-xs text-white/60 uppercase tracking-wider">
                        Sorting scope
                      </div>
                      <div className="flex flex-col gap-8">
                        <button
                          type="button"
                          onClick={() => handleSortModeScopeChange("global")}
                          className={`flex flex-row px-2 py-8 gap-2 border-2 text-xs lowercase transition-all duration-200 ${
                            sortModeScope === "global"
                              ? "bg-[var(--accent-color)] border-[var(--accent-color)] text-white"
                              : "bg-pure-black border-white/40 text-white hover:border-white"
                          }`}
                        >
                          {sortModeScope === "global" && (
                            <Check size={16} strokeWidth={2} />
                          )}

                          <span>Use one sorting for all folders</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSortModeScopeChange("perFolder")}
                          className={`flex flex-row px-2 py-8 gap-2 border-2 text-xs lowercase transition-all duration-200 ${
                            sortModeScope === "perFolder"
                              ? "bg-[var(--accent-color)] border-[var(--accent-color)] text-white"
                              : "bg-pure-black border-white/40 text-white hover:border-white"
                          }`}
                        >
                          {sortModeScope === "perFolder" && (
                            <Check size={16} strokeWidth={2} />
                          )}
                          <span>
                            Remember sorting separately for each folder
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-24">
              <div>
                <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
                  Accent Color
                </h3>

                {}
                <div className="grid grid-cols-4 gap-8 mb-24">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => handleColorChange(preset.value)}
                      className={`aspect-[2/1] border-2 transition-all duration-200 flex items-center justify-center ${
                        accentColor === preset.value
                          ? "border-white"
                          : "border-white/20 hover:border-white"
                      }`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    >
                      {accentColor === preset.value && (
                        <div className="w-8 h-8 bg-white"></div>
                      )}
                    </button>
                  ))}
                </div>

                {}
                <div className="flex items-center gap-16">
                  <label className="text-white font-medium">
                    Custom Color:
                  </label>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={handleCustomColorChange}
                    className="w-48 h-48 border-2 border-white cursor-pointer bg-pure-black"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={handleCustomColorChange}
                    className="flex-1 px-8 py-8 bg-pure-black text-white border-2 border-white focus:border-[var(--accent-color)] focus:outline-none font-mono transition-all duration-200"
                    placeholder="#0050ff"
                  />
                </div>
              </div>

              {/* Waveform Theme */}
              <div className="mb-24 flex items-center gap-16">
                <label className="block text-14 font-medium mb-8">
                  Waveform Theme
                </label>
                <div className="relative inline-block">
                  <select
                    value={wavesurferTheme}
                    onChange={(e) => setWavesurferTheme(e.target.value)}
                    className={`text-xs px-8 pr-32 pl-5 py-[0.6rem] no-drag appearance-none transition-all duration-200 focus:outline-none ${
                      selectThemeClass[wavesurferTheme] ||
                      selectThemeClass.precision
                    }`}
                  >
                    <option value="precision">Precision Mode</option>
                    <option value="prettiness">Prettiness</option>
                    <option value="minimal">Minimal</option>
                  </select>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                      chevronThemeClass[wavesurferTheme] ||
                      chevronThemeClass.precision
                    }`}
                  />
                </div>
              </div>

              {/* Show Hover Plugin */}
              <div className="mb-24 flex items-center justify-between">
                <label className="text-14 font-medium">
                  Show cursor with time
                </label>
                <input
                  type="checkbox"
                  checked={wavesurferShowHover}
                  onChange={(e) => setWavesurferShowHover(e.target.checked)}
                  className="w-16 h-16 accent-accent-color cursor-pointer"
                />
              </div>

              {/* Nudge Amount */}
              <div className="mb-24">
                <label className="block text-14 font-medium mb-8">
                  Nudge Amount: {nudgeAmount.toFixed(2)}s
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.25"
                  value={nudgeAmount}
                  onChange={(e) => setNudgeAmount(parseFloat(e.target.value))}
                  className="w-full accent-accent-color"
                />
                <div className="flex justify-between text-12 text-gray-500 mt-4">
                  <span>0.25s</span>
                  <span>3s</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "audio" && (
            <div className="space-y-24">
              <div>
                <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
                  Audio Output Device
                </h3>

                {audioDevices.length > 0 ? (
                  <select
                    value={selectedDevice}
                    onChange={(e) => handleDeviceChange(e.target.value)}
                    className="w-full px-8 py-8 bg-pure-black border-2 border-white text-white focus:outline-none focus:border-[var(--accent-color)] transition-all duration-200"
                  >
                    {audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label ||
                          `audio output ${audioDevices.indexOf(device) + 1}`}
                      </option>
                    ))}
                  </select>
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
            </div>
          )}
        </div>

        {}
      </div>
    </div>
  );
}
