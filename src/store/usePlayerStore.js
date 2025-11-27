import { create } from "zustand";

let toastTimeoutId = null;

let initialAccentColor = "#0050ff";
try {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("accentColor");
    if (saved) {
      initialAccentColor = saved;
    }
  }
} catch (e) {}

try {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--accent-color", initialAccentColor);
  }
} catch (e) {}

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

  // folder / playlist context
  folderTree: null,
  currentFolderPath: null,

  // metadata / durations
  durations: {},
  fileMetadata: {},

  // UI state
  searchQuery: "",
  sortMode: "none",
  toast: null,
  dropConfirm: null,
  isDragging: false,
  dragTarget: null,

   // global UI
  accentColor: initialAccentColor,
  isSettingsOpen: false,
  isWindowMaximized: false,

  // actions: basic setters
  setFiles: (updater) =>
    set((state) => ({
      files:
        typeof updater === "function"
          ? updater(state.files)
          : updater,
    })),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  setDuration: (duration) => set({ duration }),
  setTime: (time) => set({ time }),
  setVolume: (volume) => set({ volume }),
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
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("accentColor", color);
      }
    } catch (e) {}
  },

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  toggleWindowMaximized: () => set((state) => ({ isWindowMaximized: !state.isWindowMaximized })),

  // sort mode + folder path with localStorage integration
  setCurrentFolderPath: (currentFolderPath) => {
    set({ currentFolderPath });
    // when folder changes, try to restore sort mode from storage
    try {
      const remember = localStorage.getItem("rememberLastSortMode") === "true";
      if (!remember) return;
      const scope = localStorage.getItem("sortModeScope") || "global";
      let savedSort = null;
      if (scope === "perFolder" && currentFolderPath) {
        savedSort = localStorage.getItem(`lastSortMode:${currentFolderPath}`);
      } else if (scope === "global") {
        savedSort = localStorage.getItem("lastSortMode");
      }
      if (savedSort) {
        set({ sortMode: savedSort });
      }
    } catch (e) {}
  },

  setSortMode: (sortMode) => {
    set({ sortMode });
    try {
      const remember = localStorage.getItem("rememberLastSortMode") === "true";
      if (!remember || !sortMode) return;
      const scope = localStorage.getItem("sortModeScope") || "global";
      const { currentFolderPath } = get();
      if (scope === "perFolder") {
        if (currentFolderPath) {
          localStorage.setItem(`lastSortMode:${currentFolderPath}`, sortMode);
        }
      } else {
        localStorage.setItem("lastSortMode", sortMode);
      }
    } catch (e) {}
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
