import { useState } from "react";
import { Check } from "lucide-react";
import usePlayerStore from "../../store/usePlayerStore";
import CheckboxRow from "./CheckboxRow";

const readFlag = (key) => localStorage.getItem(key) === "true";

function SortScopeButton({ scope, current, onSelect, children }) {
  const isActive = current === scope;
  return (
    <button
      type="button"
      onClick={() => onSelect(scope)}
      className={`flex flex-row px-2 py-8 gap-2 border-2 text-xs lowercase transition-colors duration-200 ${isActive
          ? "bg-[var(--accent-color)] border-[var(--accent-color)] text-white"
          : "bg-pure-black border-white/40 text-white hover:border-white"
        }`}
    >
      {isActive && <Check size={16} strokeWidth={2} />}
      <span>{children}</span>
    </button>
  );
}

function StartupSection() {
  const [rememberLastFolder, setRememberLastFolder] = useState(() =>
    readFlag("rememberLastFolder")
  );
  const [rememberLastSortMode, setRememberLastSortMode] = useState(() =>
    readFlag("rememberLastSortMode")
  );
  const [sortModeScope, setSortModeScope] = useState(() =>
    localStorage.getItem("sortModeScope") === "perFolder" ? "perFolder" : "global"
  );

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

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Startup
      </h3>

      <CheckboxRow
        id="remember-last-folder"
        checked={rememberLastFolder}
        onChange={handleRememberLastFolderChange}
        label="Open to last folder on startup"
        description="When enabled, audinspect will automatically open the last folder you had open when you start the app."
      />

      <div className="mt-24">
        <CheckboxRow
          id="remember-last-sort"
          checked={rememberLastSortMode}
          onChange={handleRememberLastSortModeChange}
          label="Remember last sorting option"
          description="When enabled, audinspect will remember and restore your last playlist sorting mode on startup."
        />

        {rememberLastSortMode && (
          <div className="mt-16 space-y-8">
            <div className="text-xs text-white/60 uppercase tracking-wider">
              Sorting scope
            </div>
            <div className="flex flex-col gap-8">
              <SortScopeButton
                scope="global"
                current={sortModeScope}
                onSelect={handleSortModeScopeChange}
              >
                Use one sorting for all folders
              </SortScopeButton>
              <SortScopeButton
                scope="perFolder"
                current={sortModeScope}
                onSelect={handleSortModeScopeChange}
              >
                Remember sorting separately for each folder
              </SortScopeButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlaybackSection() {
  const nudgeAmount = usePlayerStore((state) => state.nudgeAmount);
  const setNudgeAmount = usePlayerStore((state) => state.setNudgeAmount);
  const preservePitch = usePlayerStore((state) => state.preservePitch);
  const setPreservePitch = usePlayerStore((state) => state.setPreservePitch);
  const playOnSeekWhenPaused = usePlayerStore(
    (state) => state.playOnSeekWhenPaused
  );
  const setPlayOnSeekWhenPaused = usePlayerStore(
    (state) => state.setPlayOnSeekWhenPaused
  );
  const nudgePercent = ((nudgeAmount - 0.25) / 2.75) * 100;

  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-16 uppercase tracking-wider">
        Playback
      </h3>

      <div className="flex items-center gap-16">
        <label
          htmlFor="nudge-amount"
          className="block text-14 font-medium whitespace-nowrap"
        >
          Nudge amount
        </label>
        <input
          id="nudge-amount"
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          value={nudgeAmount}
          onChange={(e) => setNudgeAmount(parseFloat(e.target.value))}
          aria-label="Nudge amount in seconds"
          className="flex-1 h-2 bg-white/20 appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${nudgePercent}%, rgba(255,255,255,0.2) ${nudgePercent}%, rgba(255,255,255,0.2) 100%)`,
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
        <CheckboxRow
          id="preserve-pitch"
          checked={preservePitch}
          onChange={setPreservePitch}
          label="Preserve pitch when changing speed"
          description="When enabled, changing playback speed will not affect the pitch of the audio."
        />
      </div>

      <div className="mt-24">
        <CheckboxRow
          id="play-on-seek"
          checked={playOnSeekWhenPaused}
          onChange={setPlayOnSeekWhenPaused}
          label="Play on seek when paused"
          description="When enabled, seeking on the waveform while paused will automatically resume playback."
        />
      </div>
    </div>
  );
}

export default function GeneralTab() {
  return (
    <div className="space-y-24">
      <StartupSection />
      <PlaybackSection />
    </div>
  );
}
