import { useState, useEffect, useRef } from "react";
import { X, Palette, Volume2, Settings2, Info } from "lucide-react";
import GeneralTab from "./settings/GeneralTab";
import AppearanceTab from "./settings/AppearanceTab";
import AudioTab from "./settings/AudioTab";
import AboutTab from "./settings/AboutTab";

const TABS = [
  { id: "general", label: "General", icon: Settings2, component: GeneralTab },
  { id: "appearance", label: "Appearance", icon: Palette, component: AppearanceTab },
  { id: "audio", label: "Audio", icon: Volume2, component: AudioTab },
  { id: "about", label: "About", icon: Info, component: AboutTab },
];

// mounted only while open (see App.jsx), so every tab reads its initial
// state fresh and the native <dialog> handles focus trapping and Escape
export default function Settings({ onClose }) {
  const [activeTab, setActiveTab] = useState("general");
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const ActiveTab =
    TABS.find((tab) => tab.id === activeTab)?.component || GeneralTab;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="settings-title"
      className="bg-pure-black border-2 border-white w-full max-w-2xl h-[485px] max-h-[90vh] p-0 text-white open:flex flex-col backdrop:bg-pure-black/70"
    >
      <div className="flex items-center justify-between p-16 sm:p-24 border-b-2 border-white">
        <h2 id="settings-title" className="text-xl font-bold text-white">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="bg-pure-black border-2 border-white hover:bg-white hover:text-pure-black text-white p-4 transition-colors duration-200"
          aria-label="Close settings"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="flex border-b-2 border-white" role="tablist">
        {TABS.map((tab, index) => {
          const Icon = tab.icon;
          const isLast = index === TABS.length - 1;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-8 px-8 sm:px-16 py-8 text-white transition-colors duration-200 ${isLast ? "" : "border-r-2 border-white "}${activeTab === tab.id
                  ? "bg-[var(--accent-color)]"
                  : "bg-pure-black hover:bg-white/10"
                }`}
            >
              <Icon size={16} strokeWidth={2} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 p-16 sm:p-24 overflow-y-auto">
        <ActiveTab />
      </div>
    </dialog>
  );
}
