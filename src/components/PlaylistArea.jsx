import { useState, useRef, useCallback, useEffect } from "react";
import { List } from "react-window";
import { Search, File, Folder, CircleX, ChevronDown } from "lucide-react";
import {
  formatTime,
  formatBytes,
  formatFileType,
  formatDateFromMeta,
} from "../utils/formatters";

export default function PlaylistArea({
  playlistAreaRef,
  isDragging,
  dragTarget,
  currentFolderPath,
  files,
  searchQuery,
  onSearchChange,
  sortMode,
  setSortMode,
  durations,
  fileMetadata,
  getDisplayName,
  handleOpenFolder,
  handleOpenFile,
  loadAtIndex,
  currentIndex,
  selectedIndex,
  isPlaying,
  onDeleteTrack,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const listContainerRef = useRef(null);
  const sortMenuRef = useRef(null);

  const sortOptions = [
    { value: "none", label: "name (A-Z)" },
    { value: "nameDesc", label: "name (Z-A)" },
    { value: "length", label: "length (short - long)" },
    { value: "lengthDesc", label: "length (long - short)" },
    { value: "date", label: "last modified (newest)" },
    { value: "dateOldest", label: "last modified (oldest)" },
  ];

  useEffect(() => {
    if (!isSortMenuOpen) return;
    const handleClickOutside = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) {
        setIsSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSortMenuOpen]);
  const pairs = files.map((f, idx) => ({ f, idx }));
  const q = (searchQuery || "").toLowerCase().trim();
  const filtered = q
    ? pairs.filter((p) => {
        const displayName = getDisplayName(p.f);
        return displayName.toLowerCase().includes(q);
      })
    : pairs;

  let rows = filtered;
  if (sortMode) {
    rows = [...filtered].sort((a, b) => {
      const fa = a.f;
      const fb = b.f;
      if (
        sortMode === "none" ||
        sortMode === "name" ||
        sortMode === "nameDesc"
      ) {
        const na = (getDisplayName(fa) || "").toLowerCase();
        const nb = (getDisplayName(fb) || "").toLowerCase();
        return sortMode === "nameDesc"
          ? nb.localeCompare(na)
          : na.localeCompare(nb);
      }
      if (sortMode === "length" || sortMode === "lengthDesc") {
        const la = typeof durations[fa] === "number" ? durations[fa] : Infinity;
        const lb = typeof durations[fb] === "number" ? durations[fb] : Infinity;
        if (la !== lb) return sortMode === "lengthDesc" ? lb - la : la - lb;
        const na = (getDisplayName(fa) || "").toLowerCase();
        const nb = (getDisplayName(fb) || "").toLowerCase();
        return na.localeCompare(nb);
      }
      if (sortMode === "date" || sortMode === "dateOldest") {
        const ma = fileMetadata[fa];
        const mb = fileMetadata[fb];
        const ta =
          ma &&
          (typeof ma.mtimeMs === "number"
            ? ma.mtimeMs
            : ma.mtimeIso
            ? Date.parse(ma.mtimeIso)
            : 0);
        const tb =
          mb &&
          (typeof mb.mtimeMs === "number"
            ? mb.mtimeMs
            : mb.mtimeIso
            ? Date.parse(mb.mtimeIso)
            : 0);
        if (ta !== tb) {
          return sortMode === "date"
            ? (tb || 0) - (ta || 0)
            : (ta || 0) - (tb || 0);
        }
        const na = (getDisplayName(fa) || "").toLowerCase();
        const nb = (getDisplayName(fb) || "").toLowerCase();
        return na.localeCompare(nb);
      }
      return 0;
    });
  }

  // row component for react-window 2.x
  const PlaylistRow = useCallback(
    ({ index, style, rows: rowData }) => {
      const { f, idx } = rowData[index];

      return (
        <div
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            paddingTop: "12px",
            paddingLeft: "12px",
            paddingRight: "12px",
          }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => loadAtIndex(idx)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadAtIndex(idx);
            }}
            className={`group flex items-center justify-between pl-8 pr-8 py-8 cursor-pointer transition-all duration-200 border flex-1 ${
              idx === currentIndex
                ? "bg-[var(--accent-color)]/10 border-[var(--accent-color)]"
                : idx === selectedIndex
                ? "bg-pure-black border-[var(--accent-color)]"
                : "bg-pure-black border-white/20 hover:border-white"
            }`}
          >
            <div className="flex items-center gap-8 flex-1 min-w-0">
              <div
                className={`w-8 h-8 ${
                  idx === currentIndex && isPlaying
                    ? "bg-[var(--accent-color)] animate-pulse"
                    : idx === currentIndex
                    ? "bg-[var(--accent-color)]"
                    : "bg-white/20"
                } rounded-full flex-shrink-0`}
              />
              <div className="flex items-center justify-between gap-4 flex-1 min-w-0">
                <div className="truncate text-white text-sm">
                  {getDisplayName(f)}
                </div>
                <div className="ml-4 text-[11px] text-white/40 text-right flex-shrink-0 max-w-[50%]">
                  {(() => {
                    const meta = fileMetadata && fileMetadata[f];
                    const lengthSec =
                      durations && typeof durations[f] === "number"
                        ? durations[f]
                        : null;
                    const pieces = [];
                    if (lengthSec != null) {
                      pieces.push(formatTime(lengthSec));
                    }
                    if (meta && typeof meta.size === "number") {
                      const sizeLabel = formatBytes(meta.size);
                      if (sizeLabel) pieces.push(sizeLabel);
                    }
                    if (meta && meta.type) {
                      const typeLabel = formatFileType(meta.type);
                      if (typeLabel) pieces.push(typeLabel);
                    }
                    const mtimeSource =
                      meta && (meta.mtimeIso != null || meta.mtimeMs != null)
                        ? meta.mtimeIso != null
                          ? meta.mtimeIso
                          : meta.mtimeMs
                        : null;
                    if (mtimeSource != null) {
                      const dateLabel = formatDateFromMeta(mtimeSource);
                      if (dateLabel) pieces.push(dateLabel);
                    }
                    return pieces.join("  •  ");
                  })()}
                </div>
              </div>
            </div>
            {!currentFolderPath && (
              <button
                className="opacity-0 ml-[0.6rem] group-hover:opacity-100 transition-opacity bg-pure-black border border-white hover:bg-white hover:text-pure-black text-white p-4 no-drag flex-shrink-0"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDeleteTrack(idx);
                }}
                aria-label={`Delete ${getDisplayName(f)}`}
              >
                <CircleX size={18} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      );
    },
    [
      rows,
      currentIndex,
      selectedIndex,
      isPlaying,
      fileMetadata,
      durations,
      getDisplayName,
      currentFolderPath,
      onDeleteTrack,
    ]
  );

  return (
    <div
      ref={playlistAreaRef}
      className="relative bg-pure-black border-2 border-white flex-1 overflow-hidden flex flex-col"
      style={{ zIndex: 10, pointerEvents: "auto" }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && dragTarget === "playlist" && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            backgroundColor: `${
              getComputedStyle(document.documentElement)
                .getPropertyValue("--accent-color")
                .trim() || "#0050ff"
            }33`,
          }}
        >
          <div
            className="bg-pure-black border-2 p-48"
            style={{
              borderColor:
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--accent-color")
                  .trim() || "#0050ff",
            }}
          >
            <div className="text-2xl font-bold text-white text-center">
              drop audio files here
            </div>
            <div className="text-sm text-white/60 text-center mt-8">
              supports folders and multiple files
            </div>
          </div>
        </div>
      )}
      <div className="bg-pure-black p-16 border-b-2 border-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-16">
            <h3 className="font-bold text-white text-lg">
              {currentFolderPath
                ? currentFolderPath.split(/[\\/]/).filter(Boolean).pop() ||
                  "playlist"
                : "playlist"}
            </h3>
            <span className="text-xs font-mono text-white/60 bg-white/10 px-8 py-4">
              {files.length} {files.length === 1 ? "file" : "files"}
            </span>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-8 bg-pure-black border-2 border-white focus-within:border-[var(--accent-color)] transition-all px-3 py-8">
              <Search size={16} strokeWidth={2} className="text-white/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="search..."
                className="flex-1 bg-transparent text-sm text-white focus:outline-none"
              />
            </div>
            <div ref={sortMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsSortMenuOpen((prev) => !prev)}
                className="bg-pure-black text-white border-2 border-white text-xs w-[185px] px-8 py-[0.5rem] no-drag focus:outline-none focus:border-[var(--accent-color)] transition-all text-left flex items-center justify-between"
              >
                <span>{sortOptions.find((o) => o.value === sortMode)?.label || "name (A-Z)"}</span>
                <ChevronDown size={14} strokeWidth={2} className="text-white/70" />
              </button>
              {isSortMenuOpen && (
                <div className="absolute right-0 mt-2 w-[185px] bg-pure-black border-2 border-white shadow-lg z-50">
                  {sortOptions.map((option) => {
                    const isActive = option.value === sortMode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSortMode(option.value);
                          setIsSortMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-2 text-xs no-drag transition-colors ${
                          isActive
                            ? "bg-[var(--accent-color)] text-white"
                            : "bg-pure-black text-white hover:bg-white hover:text-pure-black"
                        }`}
                      >
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div
              className="relative"
              onBlur={(e) => {
                const next = e.relatedTarget;
                if (!next || !e.currentTarget.contains(next)) {
                  setIsOpenMenu(false);
                }
              }}
            >
              <button
                type="button"
                title="Open files or folder"
                className="w-[110px] bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-8 py-8 transition-all duration-200 no-drag flex items-center justify-between gap-4"
                aria-label="Open files or folder"
                aria-haspopup="menu"
                aria-expanded={isOpenMenu}
                aria-controls="playlist-open-menu"
                onClick={() => setIsOpenMenu((prev) => !prev)}
              >
                <span className="text-sm font-medium">Open</span>
                <ChevronDown size={14} strokeWidth={2} />
              </button>
              {isOpenMenu && (
                <div
                  id="playlist-open-menu"
                  className="absolute right-0 mt-2 w-[180px] bg-pure-black border-2 border-white shadow-lg z-50"
                  role="menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setIsOpenMenu(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenMenu(false);
                      handleOpenFile && handleOpenFile();
                    }}
                    title="Open file"
                    className="w-full flex items-center gap-4 px-8 py-8 text-sm text-white hover:bg-white hover:text-pure-black no-drag"
                    aria-label="Open file"
                    role="menuitem"
                  >
                    <File size={16} strokeWidth={2} />
                    <span>Open file</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenMenu(false);
                      handleOpenFolder && handleOpenFolder();
                    }}
                    title="Open folder"
                    className="w-full flex items-center gap-4 px-8 py-8 text-sm text-white hover:bg-white hover:text-pure-black no-drag"
                    aria-label="Open folder"
                    role="menuitem"
                  >
                    <Folder size={16} strokeWidth={2} />
                    <span>Open folder</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div ref={listContainerRef} className="flex-1 overflow-hidden">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-32">
            <div className="text-lg font-semibold text-white/60 mb-8">
              No files loaded
            </div>
            <div className="text-sm text-white/40">
              Drag and drop audio files or click open folder
            </div>
          </div>
        ) : (
          <List
            rowCount={rows.length}
            rowHeight={44}
            rowComponent={PlaylistRow}
            rowProps={{ rows }}
          />
        )}
      </div>
    </div>
  );
}
