// animated bars shown over the waveform area while a track is decoding
function getAccentColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color")
      .trim() || "#0050ff"
  );
}

const BARS = Array.from({ length: 100 }, (_, i) => i);

export default function WaveformLoading() {
  const accentColor = getAccentColor();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-pure-black z-10 gap-2"
      aria-hidden="true"
    >
      {BARS.map((i) => (
        <div
          key={i}
          className="w-2"
          style={{
            height: "10%",
            backgroundColor: `${accentColor}66`,
            animation: "waveform-load 0.5s ease-in-out infinite",
            animationDelay: `${i * 0.009}s`,
          }}
        />
      ))}
    </div>
  );
}
