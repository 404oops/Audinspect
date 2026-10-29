import { useState, useEffect } from "react";
import appIcon from "../../../resources/icon.png";

export default function AboutTab() {
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    let active = true;
    window.electronAPI
      ?.getAppVersion?.()
      .then((v) => {
        if (active && v) setAppVersion(v);
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <img
        src={appIcon}
        alt="Audinspect Icon"
        className="w-96 h-96 mb-16"
      />
      <h3 className="text-2xl font-bold text-white mb-8">Audinspect</h3>
      <p className="text-white/60 mb-4">Version {appVersion || "…"}</p>
      <p className="text-white/40 text-sm">Created by 404oops</p>

      <div className="flex gap-4 mt-6">
        <button
          onClick={() => window.electronAPI.openExternal('https://github.com/404oops/Audinspect')}
          className="text-white/50 hover:text-white text-sm transition-colors"
        >
          GitHub
        </button>
        <span className="text-white/20">•</span>
        <button
          onClick={() => window.electronAPI.openExternal('https://github.com/404oops/Audinspect/blob/main/LICENSE')}
          className="text-white/50 hover:text-white text-sm transition-colors"
        >
          License
        </button>
      </div>

      <p className="text-white/20 text-xs mt-8">© 2025 404oops. Licensed under GPL-3.0.</p>
    </div>
  );
}
