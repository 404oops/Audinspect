import usePlayerStore from "../../store/usePlayerStore";
import CheckboxRow from "./CheckboxRow";
import Dropdown from "./Dropdown";

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

const THEME_OPTIONS = [
  { value: "default", label: "Default (filled)" },
  { value: "sleek", label: "Sleek (rounded bars)" },
  { value: "classic", label: "Classic (flat bars)" },
];

function AccentColorSection() {
  const accentColor = usePlayerStore((state) => state.accentColor);
  const setAccentColor = usePlayerStore((state) => state.setAccentColor);

  const handleColorChange = (color) => {
    setAccentColor(color);
    document.documentElement.style.setProperty("--accent-color", color);
    localStorage.setItem("accentColor", color);
  };

  const handleCustomColorChange = (e) => {
    handleColorChange(e.target.value);
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Accent Color
      </h3>

      <div className="grid grid-cols-4 gap-8 mb-24">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handleColorChange(preset.value)}
            className={`aspect-[2/1] border-2 transition-colors duration-200 flex items-center justify-center ${accentColor === preset.value
                ? "border-white"
                : "border-white/20 hover:border-white"
              }`}
            style={{ backgroundColor: preset.value }}
            title={preset.name}
            aria-label={preset.name}
          >
            {accentColor === preset.value && (
              <div className="w-8 h-8 bg-white"></div>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-16">
        <label htmlFor="custom-color-hex" className="text-white font-medium">
          Custom Color:
        </label>
        <input
          id="custom-color-picker"
          type="color"
          value={accentColor}
          onChange={handleCustomColorChange}
          aria-label="Pick a custom accent color"
          className="w-48 h-48 border-2 border-white cursor-pointer bg-pure-black"
        />
        <input
          id="custom-color-hex"
          type="text"
          value={accentColor}
          onChange={handleCustomColorChange}
          className="flex-1 px-8 py-8 bg-pure-black text-white border-2 border-white focus:border-[var(--accent-color)] focus:outline-none font-mono transition-colors duration-200"
          placeholder="#0050ff"
        />
      </div>
    </div>
  );
}

function WaveformSection() {
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

  return (
    <>
      <div className="mb-24">
        <div className="flex items-center gap-16">
          <span id="waveform-theme-label" className="block text-14 font-medium">
            Waveform Theme
          </span>
          <Dropdown
            value={wavesurferTheme}
            options={THEME_OPTIONS}
            onChange={setWavesurferTheme}
            fallbackLabel="Default (filled)"
            labelledBy="waveform-theme-label"
            buttonClassName="bg-pure-black text-white border-2 border-white text-xs w-[190px] px-8 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-colors text-left flex items-center justify-between"
            menuClassName="absolute left-0 mt-2 w-[190px] bg-pure-black border-2 border-white shadow-lg z-50"
          />
        </div>
        <p className="mt-8 text-sm text-white/40">
          Applies immediately, playback keeps going.
        </p>
      </div>

      <div className="mb-24">
        <CheckboxRow
          id="show-hover-cursor"
          checked={wavesurferShowHover}
          onChange={setWavesurferShowHover}
          label="Show cursor with time"
        />
      </div>
      <p className="mt-8 text-sm text-white/40">
        When enabled, you will see a visible seek head with a flag on the upper-right corner indicating the time at the position of the seek head when you move your cursor on the track view.
      </p>
    </>
  );
}

export default function AppearanceTab() {
  return (
    <div className="space-y-24">
      <AccentColorSection />
      <WaveformSection />
    </div>
  );
}
