import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
} from "lucide-react";

const iconButtonClass =
  "bg-pure-black border-2 border-white hover:bg-[var(--accent-color)] hover:border-[var(--accent-color)] text-white p-8 transition-colors duration-200 no-drag";

function formatNudge(nudgeAmount) {
  if (typeof nudgeAmount !== "number") return "0";
  return Number.isInteger(nudgeAmount)
    ? nudgeAmount.toFixed(0)
    : nudgeAmount.toFixed(2);
}

export default function TransportControls({
  hop,
  prev,
  next,
  togglePlay,
  isPlaying,
  isLoaded,
  nudgeAmount,
}) {
  const labelNudge = formatNudge(nudgeAmount);

  return (
    <div className="flex items-center gap-8 justify-center">
      <button
        type="button"
        onClick={() => hop(-1)}
        title={`Jump -${labelNudge}s`}
        className={iconButtonClass}
        aria-label={`Jump back ${labelNudge} seconds`}
      >
        <RotateCcw size={20} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={prev}
        className={iconButtonClass}
        aria-label="Previous file"
      >
        <SkipBack size={20} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!isLoaded}
        className="bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-16 py-[0.5rem] transition-colors hover:cursor-pointer"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause size={30} strokeWidth={2} />
        ) : (
          <Play size={30} strokeWidth={2} />
        )}
      </button>
      <button
        type="button"
        onClick={next}
        className={iconButtonClass}
        aria-label="Next file"
      >
        <SkipForward size={20} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => hop(1)}
        title={`Jump +${labelNudge}s`}
        className={iconButtonClass}
        aria-label={`Jump forward ${labelNudge} seconds`}
      >
        <RotateCw size={20} strokeWidth={2} />
      </button>
    </div>
  );
}
