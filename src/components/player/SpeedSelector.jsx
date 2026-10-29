import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import usePlayerStore from "../../store/usePlayerStore";

const PRESET_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function parseSpeed(raw) {
  const value = parseFloat(String(raw).trim().replace(/[x×]/gi, ""));
  return Number.isNaN(value) ? null : value;
}

function presetLabel(speed) {
  return Number.isInteger(speed) ? speed.toFixed(0) : speed.toFixed(2);
}

// free-text playback speed with a dropdown of presets; reads and writes the
// store directly so the player area doesn't have to thread it through
export default function SpeedSelector() {
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const setPlaybackSpeed = usePlayerStore((state) => state.setPlaybackSpeed);
  const [speedText, setSpeedText] = useState(() => playbackSpeed.toFixed(2));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isCustomSpeed = !PRESET_SPEEDS.includes(playbackSpeed);

  useEffect(() => {
    setSpeedText(playbackSpeed.toFixed(2));
  }, [playbackSpeed]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  const commit = (raw) => {
    const value = parseSpeed(raw);
    if (value != null) setPlaybackSpeed(value);
    else setSpeedText(playbackSpeed.toFixed(2));
  };

  return (
    <div className="pl-8 mb-[3px] flex items-center">
      <div ref={menuRef} className="relative inline-block">
        <input
          id="playback-speed-input"
          type="text"
          inputMode="decimal"
          value={`${speedText}x`}
          onChange={(e) => setSpeedText(e.target.value.replace(/[x×]/gi, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(e.target.value);
              e.target.blur();
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          className="bg-pure-black text-white border-2 border-white text-xs w-[70px] pr-6 py-[0.5rem] focus:outline-none focus:border-[var(--accent-color)] transition-colors text-right"
          aria-label="Playback speed"
        />
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-white/70 px-1 py-1"
          aria-label="Playback speed presets"
          aria-haspopup="listbox"
          aria-expanded={isMenuOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          <ChevronDown size={14} strokeWidth={2} />
        </button>
        {isMenuOpen && (
          <div
            role="listbox"
            aria-label="Playback speed presets"
            className="absolute right-0 mt-2 w-[120px] bg-pure-black border-2 border-white shadow-lg z-50"
          >
            {isCustomSpeed && (
              <div className="px-10 py-4 text-[11px] text-white/50">
                current: {playbackSpeed.toFixed(2)}×
              </div>
            )}
            {PRESET_SPEEDS.map((speed) => {
              const isActive = speed === playbackSpeed;
              return (
                <button
                  key={speed}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    setPlaybackSpeed(speed);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2 py-2 text-xs transition-colors ${
                    isActive
                      ? "bg-[var(--accent-color)] text-white"
                      : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                  }`}
                >
                  <span>{`${presetLabel(speed)}x ${speed === 1 ? "(default)" : ""}`}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
