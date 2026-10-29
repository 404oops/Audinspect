import { create } from "zustand";
import { settingsStorage } from "../platform/settingsStorage";

let toastTimeoutId = null;

// settings are read synchronously here; main.jsx pulls the puter.kv copy
// into localStorage before this module is evaluated
const read = (key) => settingsStorage.getItem(key);
const readBool = (key, fallback) => {
  const v = read(key);
  return v === null ? fallback : v === "true";
};
const persist = (key, value) => settingsStorage.setItem(key, String(value));

const initialAccentColor = read("accentColor") || "#0050ff";
try {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--accent-color",
      initialAccentColor
    );
  }
} catch (e) { }

let initialNudgeAmount = 1.5;
{
  const savedNudge = parseFloat(read("nudgeAmount"));
  if (!Number.isNaN(savedNudge) && savedNudge >= 0.25 && savedNudge <= 3) {
    initialNudgeAmount = savedNudge;
  }
}

// playback speed always resets to 1x on startup (not persisted)
const initialPlaybackSpeed = 1;

let initialWavesurferTheme = "default";
{
  const savedTheme = read("wavesurferTheme");
  const allowedNew = ["default", "sleek", "classic"];
  if (savedTheme && allowedNew.includes(savedTheme)) {
    initialWavesurferTheme = savedTheme;
  } else if (savedTheme === "precise") {
    initialWavesurferTheme = "default";
  } else if (savedTheme === "minimal") {
    initialWavesurferTheme = "sleek";
  }
}

const initialWavesurferShowHover = readBool("wavesurferShowHover", true);
const initialAudioOutputDevice = read("audioOutputDevice") || "";
const initialPreservePitch = readBool("preservePitch", true);
const initialPlayOnSeekWhenPaused = readBool("playOnSeekWhenPaused", false);

const usePlayerStore = create((set, get) => ({
  // core playback / selection
  files: [],
  currentIndex: -1,
  selectedIndex: -1,
  isPlaying: false,
  isLoaded: false,

  // timeline / volume
  duration: 0,
  time: 0,
  volume: 100,
  nudgeAmount: initialNudgeAmount,
  playbackSpeed: initialPlaybackSpeed,
  wavesurferTheme: initialWavesurferTheme,
  wavesurferShowHover: initialWavesurferShowHover,
  audioOutputDevice: initialAudioOutputDevice,
  preservePitch: initialPreservePitch,
  playOnSeekWhenPaused: initialPlayOnSeekWhenPaused,

  // folder / playlist context
  folderTree: null,
  currentFolderPath: null,

  // metadata / durations
  durations: {},
  fileMetadata: {},

  // ui state
  searchQuery: "",
  sortMode: "none",
  toast: null,
  dropConfirm: null,
  isDragging: false,
  dragTarget: null,

  // global ui
  accentColor: initialAccentColor,
  isSettingsOpen: false,

  // actions: basic setters
  setFiles: (updater) =>
    set((state) => ({
      files: typeof updater === "function" ? updater(state.files) : updater,
    })),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  setDuration: (duration) => set({ duration }),
  setTime: (time) => set({ time }),
  setVolume: (volume) => set({ volume }),
  setNudgeAmount: (amount) =>
    set((state) => {
      const rangeClamped =
        typeof amount === "number" && Number.isFinite(amount)
          ? Math.min(3, Math.max(0.25, amount))
          : state.nudgeAmount;
      persist("nudgeAmount", rangeClamped);
      return { nudgeAmount: rangeClamped };
    }),
  setPlaybackSpeed: (speed) =>
    set((state) => {
      const clamped =
        typeof speed === "number" && Number.isFinite(speed)
          ? Math.min(4, Math.max(0.25, speed))
          : state.playbackSpeed;
      return { playbackSpeed: clamped };
    }),
  setWavesurferTheme: (theme) => {
    const allowed = ["default", "sleek", "classic"];
    if (!theme || !allowed.includes(theme)) return;
    set({ wavesurferTheme: theme });
    persist("wavesurferTheme", theme);
  },
  setWavesurferShowHover: (show) => {
    const val = Boolean(show);
    set({ wavesurferShowHover: val });
    persist("wavesurferShowHover", val);
  },
  setAudioOutputDevice: (deviceId) => {
    set({ audioOutputDevice: deviceId || "" });
    persist("audioOutputDevice", deviceId || "");
  },
  setPreservePitch: (preserve) => {
    const val = Boolean(preserve);
    set({ preservePitch: val });
    persist("preservePitch", val);
  },
  setPlayOnSeekWhenPaused: (enabled) => {
    const val = Boolean(enabled);
    set({ playOnSeekWhenPaused: val });
    persist("playOnSeekWhenPaused", val);
  },
  setFolderTree: (folderTree) => set({ folderTree }),
  setDurations: (durations) => set({ durations }),
  setFileMetadata: (fileMetadata) => set({ fileMetadata }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setDropConfirm: (dropConfirm) => set({ dropConfirm }),
  setIsDragging: (isDragging) => set({ isDragging }),
  setDragTarget: (dragTarget) => set({ dragTarget }),

  setAccentColor: (color) => {
    if (!color) return;
    set({ accentColor: color });
    try {
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--accent-color", color);
      }
    } catch (e) { }
    persist("accentColor", color);
  },

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  // sort mode + folder path with persisted preferences
  setCurrentFolderPath: (currentFolderPath) => {
    set({ currentFolderPath });
    // when folder changes, try to restore sort mode from storage
    const remember = read("rememberLastSortMode") === "true";
    if (!remember) return;
    const scope = read("sortModeScope") || "global";
    let savedSort = null;
    if (scope === "perFolder" && currentFolderPath) {
      savedSort = read(`lastSortMode:${currentFolderPath}`);
    } else if (scope === "global") {
      savedSort = read("lastSortMode");
    }
    if (savedSort) {
      set({ sortMode: savedSort });
    }
  },

  setSortMode: (sortMode) => {
    set({ sortMode });
    const remember = read("rememberLastSortMode") === "true";
    if (!remember || !sortMode) return;
    const scope = read("sortModeScope") || "global";
    const { currentFolderPath } = get();
    if (scope === "perFolder") {
      if (currentFolderPath) {
        persist(`lastSortMode:${currentFolderPath}`, sortMode);
      }
    } else {
      persist("lastSortMode", sortMode);
    }
  },

  // toast helpers managed in store (so component can stay stateless for this)
  showToast: (message) => {
    if (!message) return;
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
      toastTimeoutId = null;
    }
    set({ toast: { message } });
    toastTimeoutId = setTimeout(() => {
      set({ toast: null });
      toastTimeoutId = null;
    }, 4000);
  },

  hideToast: () => {
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
      toastTimeoutId = null;
    }
    set({ toast: null });
  },
}));

export default usePlayerStore;
