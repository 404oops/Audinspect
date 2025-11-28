import { useState } from "react";
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

  const PlaylistRow = ({ index, style, ariaAttributes }) => {
    const { f, idx } = rows[index];

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
  };

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
            <div className="relative">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="bg-pure-black text-white border-2 border-white text-xs w-[165px] px-[8px] py-[0.6rem] no-drag appearance-none focus:outline-none focus:border-[var(--accent-color)] transition-all"
              >
                <option value="none">name (A–Z)</option>
                <option value="nameDesc">name (Z–A)</option>
                <option value="length">length (short → long)</option>
                <option value="lengthDesc">length (long → short)</option>
                <option value="date">last modified (newest)</option>
                <option value="dateOldest">last modified (oldest)</option>
              </select>
              <ChevronDown
                size={14}
                strokeWidth={2}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70"
              />
            </div>
            <div className="relative group">
              <button
                title="Open files or folder"
                className="w-[85px] bg-[var(--accent-color)] border-2 border-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white px-4 py-8 transition-all duration-200 no-drag flex items-center gap-8 group-hover:opacity-0 group-hover:invisible justify-center"
                aria-label="Open files or folder"
              >
                Open
              </button>
              <div className="absolute inset-0 flex border-2 border-[var(--accent-color)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <button
                  onClick={() => handleOpenFile && handleOpenFile()}
                  title="Open file"
                  className="bg-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white py-8 transition-all duration-200 no-drag flex items-center justify-center border-r border-[var(--accent-color)] flex-1"
                  aria-label="Open file"
                >
                  <File size={16} strokeWidth={2} />
                </button>
                <button
                  onClick={() => handleOpenFolder && handleOpenFolder()}
                  title="Open folder"
                  className="bg-[var(--accent-color)] hover:bg-white hover:text-[var(--accent-color)] text-white py-8 transition-all duration-200 no-drag flex items-center justify-center flex-1"
                  aria-label="Open folder"
                >
                  <Folder size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
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
            style={{ height: "100%", width: "100%" }}
            rowCount={rows.length}
            rowHeight={44}
            rowComponent={PlaylistRow}
            rowProps={{}}
          />
        )}
      </div>
    </div>
  );
}
