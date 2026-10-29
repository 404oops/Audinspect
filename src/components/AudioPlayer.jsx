import { useRef, useState } from "react";
import Toast from "./Toast";
import DropConfirmModal from "./DropConfirmModal";
import PlayerArea from "./PlayerArea";
import PlaylistArea from "./PlaylistArea";
import usePlayerStore from "../store/usePlayerStore";
import { createPlayerActions } from "../player/playerActions";
import { usePlayerMount } from "../hooks/usePlayerMount";
import { useWaveSurferSettings } from "../hooks/useWaveSurferSettings";
import { useOsFileOpens, useStartupFolder } from "../hooks/useOsFileOpens";
import { useFileMetadata } from "../hooks/useFileMetadata";
import { useDurations } from "../hooks/useDurations";
import { useFolderWatcher } from "../hooks/useFolderWatcher";
import { useMediaKeys } from "../hooks/useMediaKeys";
import { useMediaSessionState } from "../hooks/useMediaSessionState";
import { useDragHandlers } from "../hooks/useDragHandlers";

export default function AudioPlayer() {
  // dom + wavesurfer
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const hoverPluginRef = useRef(null);
  const timeDisplayRef = useRef(null);
  const playerAreaRef = useRef(null);
  const playlistAreaRef = useRef(null);
  // load + playback bookkeeping
  const loadTokenRef = useRef(0);
  const currentLoadRef = useRef({ url: null, cleanup: null });
  const isScrubbingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const durationsRef = useRef({});
  const ffprobeAttemptsRef = useRef({});
  const originalNamesRef = useRef({});
  const hasFolderWatchRef = useRef(false);
  // set once a file handed over by the os has been opened, so "open last
  // folder on startup" doesn't stomp on it
  const osOpenHandledRef = useRef(false);

  // every player operation lives in a stable object built once per mount
  const [actions] = useState(() =>
    createPlayerActions({
      store: usePlayerStore,
      refs: {
        containerRef,
        wsRef,
        hoverPluginRef,
        timeDisplayRef,
        playerAreaRef,
        playlistAreaRef,
        loadTokenRef,
        currentLoadRef,
        isScrubbingRef,
        isPlayingRef,
        durationsRef,
        ffprobeAttemptsRef,
        originalNamesRef,
        hasFolderWatchRef,
        osOpenHandledRef,
      },
    })
  );

  const {
    files,
    currentIndex,
    selectedIndex,
    isPlaying,
    isLoaded,
    searchQuery,
    sortMode,
    duration,
    time,
    volume,
    currentFolderPath,
    durations,
    fileMetadata,
    toast,
    dropConfirm,
    isDragging,
    dragTarget,
    setSearchQuery,
    setSortMode,
    setVolume,
    hideToast,
    nudgeAmount,
  } = usePlayerStore();

  usePlayerMount(containerRef, actions);
  useWaveSurferSettings(wsRef, hoverPluginRef);
  useOsFileOpens(actions);
  useStartupFolder(actions);
  useFileMetadata(files);
  useDurations({
    files,
    currentIndex,
    duration,
    fileMetadata,
    durationsRef,
    ffprobeAttemptsRef,
  });
  useFolderWatcher({ currentFolderPath, durationsRef, ffprobeAttemptsRef });
  useMediaKeys(actions);
  useMediaSessionState({
    files,
    currentIndex,
    isLoaded,
    isPlaying,
    time,
    duration,
    getDisplayName: actions.getDisplayName,
  });
  const { handleDragOver, handleDragLeave, handleDrop } =
    useDragHandlers(actions);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden bg-pure-black p-24 gap-24"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toast message={toast?.message} onClose={hideToast} />

      <DropConfirmModal
        dropConfirm={dropConfirm}
        onReplace={actions.confirmDropReplace}
        onAdd={actions.confirmDropAdd}
        onCancel={actions.cancelDrop}
      />

      <PlayerArea
        playerAreaRef={playerAreaRef}
        containerRef={containerRef}
        isDragging={isDragging}
        dragTarget={dragTarget}
        files={files}
        currentIndex={currentIndex}
        getDisplayName={actions.getDisplayName}
        isLoaded={isLoaded}
        time={time}
        duration={duration}
        volume={volume}
        setVolume={setVolume}
        hop={actions.hop}
        prev={actions.prev}
        next={actions.next}
        togglePlay={actions.togglePlay}
        isPlaying={isPlaying}
        seekTo={actions.seekTo}
        handleWaveMouseDown={actions.handleWaveMouseDown}
        handleWaveMouseMove={actions.handleWaveMouseMove}
        handleWaveMouseUp={actions.handleWaveMouseUp}
        handleWaveMouseLeave={actions.handleWaveMouseLeave}
        timeDisplayRef={timeDisplayRef}
        nudgeAmount={nudgeAmount}
      />

      <PlaylistArea
        playlistAreaRef={playlistAreaRef}
        isDragging={isDragging}
        dragTarget={dragTarget}
        currentFolderPath={currentFolderPath}
        files={files}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortMode={sortMode}
        setSortMode={setSortMode}
        durations={durations}
        fileMetadata={fileMetadata}
        getDisplayName={actions.getDisplayName}
        handleOpenFolder={actions.handleOpenFolder}
        handleOpenFile={actions.handleOpenFile}
        loadAtIndex={actions.loadAtIndex}
        currentIndex={currentIndex}
        selectedIndex={selectedIndex}
        isPlaying={isPlaying}
        onDeleteTrack={actions.handleDeleteTrack}
        onCloseFolder={actions.closeFolder}
        onClearPlaylist={actions.clearPlaylist}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
    </div>
  );
}
