import React, { useState } from 'react';
import AudioPlayer from './components/AudioPlayer';
import TitleBar from './components/TitleBar';
import Settings from './components/Settings';
import BinaryDownloader from './components/BinaryDownloader';
import usePlayerStore from './store/usePlayerStore';

function App() {
  const [binariesReady, setBinariesReady] = useState(false);
  const isSettingsOpen = usePlayerStore((state) => state.isSettingsOpen);
  const openSettings = usePlayerStore((state) => state.openSettings);
  const closeSettings = usePlayerStore((state) => state.closeSettings);

  const handleSettingsClick = () => {
    openSettings();
  };

  const handleSettingsClose = () => {
    closeSettings();
  };

  return (
    <div className="app-root h-screen bg-pure-black text-white flex flex-col overflow-hidden">
      <TitleBar onSettingsClick={handleSettingsClick} />
      <AudioPlayer />
      <Settings isOpen={isSettingsOpen} onClose={handleSettingsClose} />
      {!binariesReady && (
        <BinaryDownloader
          onReady={() => setBinariesReady(true)}
          onError={(err) => console.error("Binary download error:", err)}
        />
      )}
    </div>
  );
}

export default App;

