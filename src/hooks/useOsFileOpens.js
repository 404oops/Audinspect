import { useEffect } from "react";

const call = (fn, ...args) =>
  Promise.resolve(fn(...args)).catch((e) =>
    console.warn(`${fn.name || "handler"} failed:`, e)
  );

// application menu items and files handed over by the os (double-click,
// "open with", command line), both at launch and while running
export function useOsFileOpens(actions) {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return undefined;
    const unsubs = [];
    const fromOs = { play: true, fromOs: true };

    if (typeof api.onMenuOpenFolder === "function") {
      unsubs.push(api.onMenuOpenFolder(() => call(actions.handleOpenFolder)));
    }
    if (typeof api.onMenuOpenFiles === "function") {
      unsubs.push(api.onMenuOpenFiles(() => call(actions.handleOpenFile)));
    }
    if (typeof api.onOpenFiles === "function") {
      unsubs.push(
        api.onOpenFiles((paths) => call(actions.openPaths, paths, fromOs))
      );
    }
    if (typeof api.getPendingOpenFiles === "function") {
      api
        .getPendingOpenFiles()
        .then((paths) => {
          if (Array.isArray(paths) && paths.length) {
            call(actions.openPaths, paths, fromOs);
          }
        })
        .catch(() => { });
    }
    return () => {
      unsubs.forEach((fn) => {
        try {
          if (typeof fn === "function") fn();
        } catch (e) { }
      });
    };
  }, [actions]);
}

// "open to last folder on startup"
export function useStartupFolder(actions) {
  useEffect(() => {
    call(actions.loadLastFolder);
  }, [actions]);
}
