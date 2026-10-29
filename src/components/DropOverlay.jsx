// translucent accent-tinted overlay shown over an area while files are
// dragged across it. used by both the player and the playlist.
function getAccentColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color")
      .trim() || "#0050ff"
  );
}

export default function DropOverlay() {
  const accent = getAccentColor();
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
      style={{ backgroundColor: `${accent}33` }}
    >
      <div className="bg-pure-black border-2 p-48" style={{ borderColor: accent }}>
        <div className="text-2xl font-bold text-white text-center">
          drop audio files here
        </div>
        <div className="text-sm text-white/60 text-center mt-8">
          supports folders and multiple files
        </div>
      </div>
    </div>
  );
}
