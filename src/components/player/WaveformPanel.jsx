import { formatTime } from "../../utils/formatters";
import WaveformLoading from "./WaveformLoading";

export const WAVEFORM_HEIGHT = 250;

// the wavesurfer mount point. mouse handling (click to seek, drag to scrub)
// comes from the parent; keyboard handling lives here so the waveform works
// as a slider for keyboard users. propagation is stopped because the player
// also listens for the same keys on `window`.
export default function WaveformPanel({
  containerRef,
  isLoaded,
  currentIndex,
  time,
  duration,
  seekTo,
  hop,
  togglePlay,
  handleWaveMouseDown,
  handleWaveMouseMove,
  handleWaveMouseUp,
  handleWaveMouseLeave,
}) {
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const safeTime = Number.isFinite(time) ? time : 0;

  const onKeyDown = (e) => {
    let handled = true;
    if (e.key === "ArrowLeft") hop(-1);
    else if (e.key === "ArrowRight") hop(1);
    else if (e.key === " " || e.key === "Enter" || e.code === "Space") togglePlay();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      className="relative bg-pure-black overflow-hidden"
      style={{ maxHeight: `${WAVEFORM_HEIGHT}px`, height: `${WAVEFORM_HEIGHT}px` }}
    >
      {!isLoaded && currentIndex >= 0 && <WaveformLoading />}
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek position"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeDuration)}
        aria-valuenow={Math.round(safeTime)}
        aria-valuetext={`${formatTime(safeTime)} of ${formatTime(safeDuration)}`}
        onClick={seekTo}
        onKeyDown={onKeyDown}
        onMouseDown={handleWaveMouseDown}
        onMouseMove={handleWaveMouseMove}
        onMouseUp={handleWaveMouseUp}
        onMouseLeave={handleWaveMouseLeave}
        style={{
          width: "100%",
          height: WAVEFORM_HEIGHT,
          position: "relative",
          zIndex: 0,
        }}
        className="cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60 focus-visible:-outline-offset-1"
      />
    </div>
  );
}
