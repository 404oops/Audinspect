import { X, Eraser } from "lucide-react";
import SearchField from "./SearchField";
import SortMenu from "./SortMenu";
import OpenMenu from "./OpenMenu";

const smallButtonClass =
  "bg-pure-black border-2 border-white/40 hover:border-white hover:bg-white hover:text-pure-black text-white p-4 transition-colors duration-200";

function folderTitle(currentFolderPath) {
  if (!currentFolderPath) return "playlist";
  return currentFolderPath.split(/[\\/]/).filter(Boolean).pop() || "playlist";
}

export default function PlaylistHeader({
  currentFolderPath,
  fileCount,
  onCloseFolder,
  onClearPlaylist,
  searchQuery,
  onSearchChange,
  sortMode,
  setSortMode,
  handleOpenFile,
  handleOpenFolder,
}) {
  return (
    <div className="bg-pure-black p-[12px] sm:p-16 border-b-2 border-white">
      <div className="flex flex-wrap items-center justify-between gap-x-16 gap-y-8">
        <div className="flex items-center gap-8 sm:gap-16 min-w-0">
          <h3 className="font-bold text-white text-lg truncate">
            {folderTitle(currentFolderPath)}
          </h3>
          <span className="text-xs font-mono text-white/60 bg-white/10 px-8 py-4 whitespace-nowrap">
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
          {currentFolderPath && (
            <button
              type="button"
              onClick={() => onCloseFolder && onCloseFolder()}
              title="Close folder"
              aria-label="Close folder"
              className={smallButtonClass}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
          {!currentFolderPath && fileCount > 0 && (
            <button
              type="button"
              onClick={() => onClearPlaylist && onClearPlaylist()}
              title="Clear playlist"
              aria-label="Clear playlist"
              className={smallButtonClass}
            >
              <Eraser size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-8 flex-1 sm:flex-none justify-end">
          <div className="flex-1 sm:flex-none min-w-[160px]">
            <SearchField value={searchQuery} onChange={onSearchChange} />
          </div>
          <div className="flex items-center gap-8 ml-auto">
            <SortMenu sortMode={sortMode} setSortMode={setSortMode} />
            <OpenMenu onOpenFile={handleOpenFile} onOpenFolder={handleOpenFolder} />
          </div>
        </div>
      </div>
    </div>
  );
}
