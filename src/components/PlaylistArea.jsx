import { List } from "react-window";
import { getVisibleRows } from "../utils/playlistSort";
import DropOverlay from "./DropOverlay";
import PlaylistHeader from "./playlist/PlaylistHeader";
import PlaylistRow, { ROW_HEIGHT } from "./playlist/PlaylistRow";

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
  onCloseFolder,
  onClearPlaylist,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  const rows = getVisibleRows(
    files,
    { searchQuery, sortMode, durations, fileMetadata },
    getDisplayName
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
      {isDragging && dragTarget === "playlist" && <DropOverlay />}

      <PlaylistHeader
        currentFolderPath={currentFolderPath}
        fileCount={files.length}
        onCloseFolder={onCloseFolder}
        onClearPlaylist={onClearPlaylist}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        sortMode={sortMode}
        setSortMode={setSortMode}
        handleOpenFile={handleOpenFile}
        handleOpenFolder={handleOpenFolder}
      />

      {/* static bottom spacer so the last row keeps the same gap as the first */}
      <div className="flex-1 overflow-hidden pb-[12px]">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-32">
            <div className="text-lg font-semibold text-white/60 mb-8">
              No files loaded
            </div>
            <div className="text-sm text-white/40">
              drag and drop audio files or folders here, or use open
            </div>
          </div>
        ) : (
          <List
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={PlaylistRow}
            rowProps={{
              rows,
              currentIndex,
              selectedIndex,
              isPlaying,
              fileMetadata,
              durations,
              getDisplayName,
              currentFolderPath,
              onDeleteTrack,
              loadAtIndex,
            }}
          />
        )}
      </div>
    </div>
  );
}
