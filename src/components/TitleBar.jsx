import { Settings } from "lucide-react";

// the puter window supplies the real title bar and its controls; this strip
// keeps the app's name and the settings button where they always were
export default function TitleBar({ onSettingsClick }) {
  return (
    <div className="titlebar bg-pure-black border-b-2 border-white flex items-center justify-between h-32 px-16 select-none">
      <div className="flex items-center gap-2">
        <div className="text-sm font-bold text-white uppercase tracking-wider">
          audinspect
        </div>
        <button
          onClick={onSettingsClick}
          className="bg-pure-black border-2 border-transparent hover:border-white text-white p-4 transition-colors duration-200"
          aria-label="Settings"
          title="Settings (Ctrl/Cmd + ,)"
        >
          <Settings size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
