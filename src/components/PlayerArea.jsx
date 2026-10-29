import { formatTime } from "../utils/formatters";
import DropOverlay from "./DropOverlay";
import WaveformPanel from "./player/WaveformPanel";
import VolumeControl from "./player/VolumeControl";
import TransportControls from "./player/TransportControls";
import SpeedSelector from "./player/SpeedSelector";

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
  nudgeAmount,
}) {
  const title =
    currentIndex >= 0 && files[currentIndex]
      ? getDisplayName(files[currentIndex])
      : "no file selected";

  return (
    <div
      ref={playerAreaRef}
      className="relative bg-pure-black border-2 border-white overflow-visible"
      style={{ flexShrink: 0, zIndex: 20 }}
    >
      {isDragging && dragTarget === "player" && <DropOverlay />}

      <div className="p-16 border-b-2 border-white">
        <div className="text-lg font-bold text-white truncate">{title}</div>
      </div>

      <WaveformPanel
        containerRef={containerRef}
        isLoaded={isLoaded}
        currentIndex={currentIndex}
        time={time}
        duration={duration}
        seekTo={seekTo}
        hop={hop}
        togglePlay={togglePlay}
        handleWaveMouseDown={handleWaveMouseDown}
        handleWaveMouseMove={handleWaveMouseMove}
        handleWaveMouseUp={handleWaveMouseUp}
        handleWaveMouseLeave={handleWaveMouseLeave}
      />

      <div className="p-[12px] sm:p-16 bg-pure-black border-t-2 border-white">
        {/* three columns side by side; on a phone the transport comes first,
            then the volume, then the clock and speed on a row of their own */}
        <div className="flex flex-col gap-[12px] sm:grid sm:grid-cols-3 sm:items-center sm:gap-16">
          <div className="order-2 sm:order-none min-w-0">
            <VolumeControl volume={volume} setVolume={setVolume} />
          </div>

          <div className="order-1 sm:order-none">
            <TransportControls
              hop={hop}
              prev={prev}
              next={next}
              togglePlay={togglePlay}
              isPlaying={isPlaying}
              isLoaded={isLoaded}
              nudgeAmount={nudgeAmount}
            />
          </div>

          <div className="order-3 sm:order-none flex items-center gap-4 sm:gap-6 md:gap-8 justify-between sm:justify-end">
            <div className="flex items-center gap-4 sm:gap-6 md:gap-8">
              <div
                ref={timeDisplayRef}
                className="text-sm font-mono text-white"
              >
                {formatTime(time)}
              </div>
              <div className="text-xs text-white/40">/</div>
              <div className="text-sm font-mono text-white/60">
                {formatTime(duration)}
              </div>
            </div>
            <SpeedSelector />
          </div>
        </div>
      </div>
    </div>
  );
}
