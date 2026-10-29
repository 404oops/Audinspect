import { X, Eraser } from "lucide-react";
import SearchField from "./SearchField";
import SortMenu from "./SortMenu";
import OpenMenu from "./OpenMenu";

const smallButtonClass =
  "bg-pure-black border-2 border-white/40 hover:border-white hover:bg-white hover:text-pure-black text-white p-4 transition-colors duration-200 no-drag";

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
    <div className="bg-pure-black p-16 border-b-2 border-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-16">
          <h3 className="font-bold text-white text-lg">
            {folderTitle(currentFolderPath)}
          </h3>
          <span className="text-xs font-mono text-white/60 bg-white/10 px-8 py-4">
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
        <div className="flex items-center gap-8">
          <SearchField value={searchQuery} onChange={onSearchChange} />
          <SortMenu sortMode={sortMode} setSortMode={setSortMode} />
          <OpenMenu onOpenFile={handleOpenFile} onOpenFolder={handleOpenFolder} />
        </div>
      </div>
    </div>
  );
}
