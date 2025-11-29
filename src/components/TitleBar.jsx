import { useState, useEffect } from "react";
import { Minus, X, Settings, Maximize2, Minimize2 } from "lucide-react";
import usePlayerStore from "../store/usePlayerStore";

export default function TitleBar({ onSettingsClick }) {
  const isMaximized = usePlayerStore((state) => state.isWindowMaximized);
  const toggleWindowMaximized = usePlayerStore(
    (state) => state.toggleWindowMaximized
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isMac =
    typeof window !== "undefined" && window.electronAPI?.platform === "darwin";

  useEffect(() => {
    const unsubscribe =
      window.electronAPI?.onFullscreenChange?.(setIsFullscreen);
    return () => unsubscribe?.();
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    toggleWindowMaximized();
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  return (
    <div className="titlebar bg-pure-black border-b-2 border-white flex items-center justify-between h-32 px-16 select-none">
      <div className="flex items-center gap-2">
        {/* on macos, leave space for native traffic light buttons (hidden in fullscreen) */}
        {isMac && !isFullscreen && <div className="w-[53px]" />}
        <div className="text-sm font-bold text-white uppercase tracking-wider">
          audinspect
        </div>
        <button
          onClick={onSettingsClick}
          className="no-drag bg-pure-black border-2 border-transparent hover:border-white text-white p-4 transition-all duration-200"
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="flex items-center">
        {!isMac && (
          <>
            <button
              onClick={handleMinimize}
              className="no-drag bg-pure-black border-2 border-transparent hover:border-white text-white p-4 transition-all duration-200"
              aria-label="Minimize"
              title="Minimize"
            >
              <Minus size={16} strokeWidth={4} />
            </button>
            <button
              onClick={handleMaximize}
              className="no-drag bg-pure-black border-2 border-transparent hover:border-white text-white p-4 transition-all duration-200"
              aria-label="Maximize"
              title="Maximize"
            >
              {isMaximized ? (
                <Minimize2 size={16} className="text-white" strokeWidth={4} />
              ) : (
                <Maximize2 size={16} className="text-white" strokeWidth={4} />
              )}
            </button>
            <button
              onClick={handleClose}
              className="no-drag bg-pure-black border-2 border-transparent hover:border-[var(--accent-color)] hover:bg-[var(--accent-color)] text-white p-4 transition-all duration-200"
              aria-label="Close"
              title="Close"
            >
              <X size={16} className="text-white" strokeWidth={4} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
