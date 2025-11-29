import { useState, useEffect, useRef } from "react";
import {
  X,
  Palette,
  Volume2,
  Settings2,
  Check,
  ChevronDown,
  Info,
} from "lucide-react";
import usePlayerStore from "../store/usePlayerStore";
import appIcon from "../../resources/icon.png";

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
  const audioOutputDevice = usePlayerStore((state) => state.audioOutputDevice);
  const setAudioOutputDevice = usePlayerStore(
    (state) => state.setAudioOutputDevice
  );
  const preservePitch = usePlayerStore((state) => state.preservePitch);
  const setPreservePitch = usePlayerStore((state) => state.setPreservePitch);
  const [audioDevices, setAudioDevices] = useState([]);
  const [activeTab, setActiveTab] = useState("general");
  const [rememberLastFolder, setRememberLastFolder] = useState(false);
  const [rememberLastSortMode, setRememberLastSortMode] = useState(false);
  const [sortModeScope, setSortModeScope] = useState("global");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const themeMenuRef = useRef(null);
  const deviceMenuRef = useRef(null);

  const themeOptions = [
    { value: "default", label: "Default" },
    { value: "sleek", label: "Sleek" },
    { value: "classic", label: "Classic" },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setIsThemeMenuOpen(false);
      }
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target)) {
        setIsDeviceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

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

      // if no device is selected yet, default to the first one
      if (audioOutputs.length > 0 && !audioOutputDevice) {
        setAudioOutputDevice(audioOutputs[0].deviceId);
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

  const handleDeviceChange = (deviceId) => {
    // update store - audioplayer will react to this and apply setSinkId
    setAudioOutputDevice(deviceId);
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
            className={`flex items-center gap-8 px-16 py-8 text-white transition-all duration-200 border-r-2 border-white ${
              activeTab === "audio"
                ? "bg-[var(--accent-color)]"
                : "bg-pure-black hover:bg-white/10"
            }`}
          >
            <Volume2 size={16} strokeWidth={2} />
            <span>Audio</span>
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`flex items-center gap-8 px-16 py-8 text-white transition-all duration-200 ${
              activeTab === "about"
                ? "bg-[var(--accent-color)]"
                : "bg-pure-black hover:bg-white/10"
            }`}
          >
            <Info size={16} strokeWidth={2} />
            <span>About</span>
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

              {/* playback */}
              <div>
                <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
                  Playback
                </h3>

                <div className="flex items-center gap-16">
                  <label className="block text-14 font-medium whitespace-nowrap">
                    Nudge amount
                  </label>
                  <input
                    type="range"
                    min="0.25"
                    max="3"
                    step="0.25"
                    value={nudgeAmount}
                    onChange={(e) =>
                      setNudgeAmount(parseFloat(e.target.value))
                    }
                    className="flex-1 h-2 bg-white/20 appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((nudgeAmount - 0.25) / 2.75) * 100}%, rgba(255,255,255,0.2) ${((nudgeAmount - 0.25) / 2.75) * 100}%, rgba(255,255,255,0.2) 100%)`,
                    }}
                  />
                  <div className="text-sm font-mono text-white/60 min-w-[60px] text-right">
                    {nudgeAmount.toFixed(2)}s
                  </div>
                </div>
                <div className="flex justify-between text-12 text-white/40 mt-4 ml-[120px]">
                  <span>0.25s</span>
                  <span className="mr-[68px]">3s</span>
                </div>

                <div className="mt-24">
                  <label className="flex items-center gap-5 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={preservePitch}
                        onChange={(e) => setPreservePitch(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`size-6 border-2 transition-all duration-200 ${
                          preservePitch
                            ? "bg-[var(--accent-color)] border-[var(--accent-color)]"
                            : "bg-pure-black border-white/40 group-hover:border-white"
                        }`}
                      >
                        {preservePitch && (
                          <Check size={20} strokeWidth={2} />
                        )}
                      </div>
                    </div>
                    <span className="text-white">
                      Preserve pitch when changing speed
                    </span>
                  </label>
                  <p className="mt-[1rem] text-sm text-white/40">
                    When enabled, changing playback speed will not affect the pitch of the audio.
                  </p>
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

              {/* waveform theme */}
              <div className="mb-24">
                <div className="flex items-center gap-16">
                  <label className="block text-14 font-medium">
                    Waveform Theme
                  </label>
                  <div ref={themeMenuRef} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setIsThemeMenuOpen((prev) => !prev)}
                      className="bg-pure-black text-white border-2 border-white text-xs w-[120px] px-8 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-all text-left flex items-center justify-between"
                    >
                      <span>{themeOptions.find((o) => o.value === wavesurferTheme)?.label || "Classic"}</span>
                      <ChevronDown size={14} strokeWidth={2} className="text-white/70" />
                    </button>
                    {isThemeMenuOpen && (
                      <div className="absolute left-0 mt-2 w-[120px] bg-pure-black border-2 border-white shadow-lg z-50">
                        {themeOptions.map((option) => {
                          const isActive = option.value === wavesurferTheme;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setWavesurferTheme(option.value);
                                setIsThemeMenuOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2 py-2 text-xs no-drag transition-colors ${
                                isActive
                                  ? "bg-[var(--accent-color)] text-white"
                                  : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                              }`}
                            >
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-8 text-sm text-white/40">
                  Changing the theme will briefly pause playback.
                </p>
              </div>

              {/* show hover plugin */}
              <div className="mb-24">
                <label className="flex items-center gap-5 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={wavesurferShowHover}
                      onChange={(e) => setWavesurferShowHover(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`size-6 border-2 transition-all duration-200 ${
                        wavesurferShowHover
                          ? "bg-[var(--accent-color)] border-[var(--accent-color)]"
                          : "bg-pure-black border-white/40 group-hover:border-white"
                      }`}
                    >
                      {wavesurferShowHover && (
                        <Check size={20} strokeWidth={2} />
                      )}
                    </div>
                  </div>
                  <span className="text-white">Show cursor with time</span>
                  
                </label>
              </div>
              <p className="mt-8 text-sm text-white/40">
                  When enabled, you will see a visible seek head with a flag on the upper-right corner indicating the time at the position of the seek head when you move your cursor on the track view.
                </p>
                <p className="mt-8 text-sm text-white/40">
                  Changing this will briefly pause playback.
                </p>

            </div>
          )}

          {activeTab === "audio" && (
            <div className="space-y-24">
              <div>
                <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
                  Audio Output Device
                </h3>

                {audioDevices.length > 0 ? (
                  <div ref={deviceMenuRef} className="relative w-full">
                    <button
                      type="button"
                      onClick={() => setIsDeviceMenuOpen((prev) => !prev)}
                      className="w-full bg-pure-black text-white border-2 border-white text-xs px-8 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-all text-left flex items-center justify-between"
                    >
                      <span className="truncate">
                        {audioDevices.find((d) => d.deviceId === audioOutputDevice)?.label ||
                          `audio output ${audioDevices.findIndex((d) => d.deviceId === audioOutputDevice) + 1}` ||
                          "Select device"}
                      </span>
                      <ChevronDown size={14} strokeWidth={2} className="text-white/70 flex-shrink-0 ml-2" />
                    </button>
                    {isDeviceMenuOpen && (
                      <div className="absolute left-0 mt-2 w-full bg-pure-black border-2 border-white shadow-lg z-50 max-h-[200px] overflow-y-auto">
                        {audioDevices.map((device, idx) => {
                          const isActive = device.deviceId === audioOutputDevice;
                          return (
                            <button
                              key={device.deviceId}
                              type="button"
                              onClick={() => {
                                handleDeviceChange(device.deviceId);
                                setIsDeviceMenuOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2 py-2 text-xs no-drag transition-colors ${
                                isActive
                                  ? "bg-[var(--accent-color)] text-white"
                                  : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                              }`}
                            >
                              <span className="truncate">{device.label || `audio output ${idx + 1}`}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
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

          {activeTab === "about" && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <img
                src={appIcon}
                alt="Audinspect Icon"
                className="w-96 h-96 mb-16"
              />
              <h3 className="text-2xl font-bold text-white mb-8">Audinspect</h3>
              <p className="text-white/60 mb-4">Version 2.1.0 (a)</p>
              <p className="text-white/40 text-sm">Created by 404oops</p>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => window.electronAPI.openExternal('https://github.com/404oops/Audinspect')}
                  className="text-white/50 hover:text-white text-sm transition-colors"
                >
                  GitHub
                </button>
                <span className="text-white/20">•</span>
                <button
                  onClick={() => window.electronAPI.openExternal('https://github.com/404oops/Audinspect/blob/main/LICENSE')}
                  className="text-white/50 hover:text-white text-sm transition-colors"
                >
                  License
                </button>
              </div>

              <p className="text-white/20 text-xs mt-8">© 2025 404oops. Licensed under GPL-3.0.</p>
            </div>
          )}
        </div>

        {}
      </div>
    </div>
  );
}
