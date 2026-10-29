export default function VolumeControl({ volume, setVolume }) {
  return (
    <div className="flex items-center py-2 gap-8 min-w-0">
      <label
        htmlFor="volume-slider"
        className="text-sm font-medium text-white whitespace-nowrap"
      >
        Volume
      </label>
      <input
        id="volume-slider"
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="flex-1 min-w-16 max-w-[250px] h-2 bg-white/20 appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${volume}%, rgba(255,255,255,0.2) ${volume}%, rgba(255,255,255,0.2) 100%)`,
        }}
      />
      <span className="text-sm font-mono text-white/60 w-10">
        {volume}%
      </span>
    </div>
  );
}
