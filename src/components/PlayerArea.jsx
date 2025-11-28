import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  ChevronDown,
} from "lucide-react";
import { formatTime } from "../utils/formatters";
import usePlayerStore from "../store/usePlayerStore";

export default function PlayerArea({
  playerAreaRef,
  containerRef,
  isDragging,
  dragTarget,
  files,
  currentIndex,
  getDisplayName,
  isLoaded,
  time,
  duration,
  volume,
  setVolume,
  hop,
  prev,
  next,
  togglePlay,
  isPlaying,
  seekTo,
  handleWaveMouseDown,
  handleWaveMouseMove,
  handleWaveMouseUp,
  handleWaveMouseLeave,
  timeDisplayRef,
  nudgeAmount, // <-- added
}) {
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const setPlaybackSpeed = usePlayerStore((state) => state.setPlaybackSpeed);

  const iconButtonClass =
    "bg-pure-black border-2 border-white hover:bg-[var(--accent-color)] hover:border-[var(--accent-color)] text-white p-8 transition-all duration-200 no-drag";

  const labelNudge =
    typeof nudgeAmount === "number"
      ? Number.isInteger(nudgeAmount)
        ? nudgeAmount.toFixed(0)
        : nudgeAmount.toFixed(2)
      : "0";

  const presetSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const isCustomSpeed = !presetSpeeds.includes(playbackSpeed);

  const [speedText, setSpeedText] = useState(() => playbackSpeed.toFixed(2));
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const speedMenuRef = useRef(null);

  useEffect(() => {
    setSpeedText(playbackSpeed.toFixed(2));
  }, [playbackSpeed]);

  useEffect(() => {
    if (!isSpeedMenuOpen) return;
    const handleClickOutside = (e) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
        setIsSpeedMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSpeedMenuOpen]);

  return (
    <div
      ref={playerAreaRef}
      className="relative bg-pure-black border-2 border-white overflow-visible"
      style={{ flexShrink: 0, zIndex: 20 }}
    >
      {isDragging && dragTarget === "player" && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            backgroundColor: `${
              getComputedStyle(document.documentElement)
                .getPropertyValue("--accent-color")
                .trim() || "#0050ff"
            }33`,
          }}
        >
          <div
            className="bg-pure-black border-2 p-48"
            style={{
              borderColor:
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--accent-color")
                  .trim() || "#0050ff",
            }}
          >
            <div className="text-2xl font-bold text-white text-center">
              drop audio files here
            </div>
            <div className="text-sm text-white/60 text-center mt-8">
              supports folders and multiple files
            </div>
          </div>
        </div>
      )}
      <div className="p-16 border-b-2 border-white">
        <div className="text-lg font-bold text-white truncate">
          {currentIndex >= 0 && files[currentIndex]
            ? getDisplayName(files[currentIndex])
            : "no file selected"}
        </div>
      </div>

      <div
        className="relative bg-pure-black overflow-hidden"
        style={{ maxHeight: "250px", height: "250px" }}
      >
        {!isLoaded && currentIndex >= 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-pure-black z-10 gap-2">
            {[...Array(100)].map((_, i) => {
              const accentColor =
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--accent-color")
                  .trim() || "#0050ff";
              return (
                <div
                  key={i}
                  className="w-2"
                  style={{
                    height: "10%",
                    backgroundColor: `${accentColor}66`,
                    animation: `waveform-load 0.5s ease-in-out infinite`,
                    animationDelay: `${i * 0.009}s`,
                  }}
                />
              );
            })}
          </div>
        )}
        <div
          ref={containerRef}
          onClick={seekTo}
          onMouseDown={handleWaveMouseDown}
          onMouseMove={handleWaveMouseMove}
          onMouseUp={handleWaveMouseUp}
          onMouseLeave={handleWaveMouseLeave}
          style={{
            width: "100%",
            height: 250,
            position: "relative",
            zIndex: 0,
          }}
          className="cursor-pointer"
        />
      </div>

      <div className="p-16 bg-pure-black border-t-2 border-white">
        <div className="grid grid-cols-3 items-center gap-16">
          <div className="flex items-center py-2 gap-8 min-w-0">
            <label className="text-sm font-medium text-white no-drag whitespace-nowrap">
              Volume
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 min-w-16 max-w-[250px] h-2 bg-white/20 appearance-none cursor-pointer no-drag"
              aria-label="Volume"
              style={{
                background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volume}%, rgba(255,255,255,0.2) ${volume}%, rgba(255,255,255,0.2) 100%)`,
              }}
            />
            <span className="text-sm font-mono text-white/60 w-10 no-drag">
              {volume}%
            </span>
          </div>

          <div className="flex items-center gap-8 justify-center">
            <button
              onClick={() => hop(-1)}
              title={`Jump -${labelNudge}s`}
              className={iconButtonClass}
              aria-label={`Jump back ${labelNudge} seconds`}
            >
              <RotateCcw size={20} strokeWidth={2} />
            </button>
            <button
              onClick={prev}
              className={iconButtonClass}
              aria-label="Previous file"
            >
              <SkipBack size={20} strokeWidth={2} />
            </button>
            <button
              onClick={togglePlay}
              disabled={!isLoaded}
              className="bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-16 py-[0.5rem] transition-all hover:cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause size={30} strokeWidth={2} />
              ) : (
                <Play size={30} strokeWidth={2} />
              )}
            </button>
            <button
              onClick={next}
              className={iconButtonClass}
              aria-label="Next file"
            >
              <SkipForward size={20} strokeWidth={2} />
            </button>
            <button
              onClick={() => hop(1)}
              title={`Jump +${labelNudge}s`}
              className={iconButtonClass}
              aria-label={`Jump forward ${labelNudge} seconds`}
            >
              <RotateCw size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 md:gap-8 justify-end">
            <div
              ref={timeDisplayRef}
              className="text-sm font-mono text-white no-drag"
            >
              {formatTime(time)}
            </div>
            <div className="text-xs text-white/40 no-drag">/</div>
            <div className="text-sm font-mono text-white/60 no-drag">
              {formatTime(duration)}
            </div>

            {/* Playback Speed Selector */}
            <div className="pl-8 mb-[3px] flex items-center">
              <div className="flex items-center gap-4">
                
                <div
                  ref={speedMenuRef}
                  className="relative inline-block"
                >
                  <input
                    id="playback-speed-input"
                    type="text"
                    inputMode="decimal"
                    value={`${speedText}x`}
                    onChange={(e) => setSpeedText(e.target.value.replace(/[x×]/gi, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const raw = e.target.value.trim().replace(/[x×]/gi, "");
                        const value = parseFloat(raw);
                        if (!Number.isNaN(value)) {
                          setPlaybackSpeed(value);
                        } else {
                          setSpeedText(playbackSpeed.toFixed(2));
                        }
                        e.target.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.trim().replace(/[x×]/gi, "");
                      const value = parseFloat(raw);
                      if (!Number.isNaN(value)) {
                        setPlaybackSpeed(value);
                      } else {
                        setSpeedText(playbackSpeed.toFixed(2));
                      }
                    }}
                    className="bg-pure-black text-white border-2 border-white text-xs w-[70px] pr-6 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-all text-right"
                    aria-label="Playback speed"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-white/70 px-1 py-1 no-drag"
                    aria-label="Playback speed presets"
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
                  >
                    <ChevronDown size={14} strokeWidth={2} />
                  </button>
                  {isSpeedMenuOpen && (
                    <div className="absolute right-0 mt-2 w-[120px] bg-pure-black border-2 border-white shadow-lg z-50">
                      {isCustomSpeed && (
                        <div className="px-10 py-4 text-[11px] text-white/50">
                          current: {playbackSpeed.toFixed(2)}×
                        </div>
                      )}
                      {presetSpeeds.map((speed) => {
                        const label = Number.isInteger(speed)
                          ? speed.toFixed(0)
                          : speed.toFixed(2);
                        const isActive = speed === playbackSpeed;
                        return (
                          <button
                            key={speed}
                            type="button"
                            onClick={() => {
                              setPlaybackSpeed(speed);
                              setIsSpeedMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-2 text-xs no-drag transition-colors ${
                              isActive
                                ? "bg-[var(--accent-color)] text-white"
                                : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                            }`}
                          >
                            <span>{`${label}x ${label === '1' ? '(default)' : ''}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
