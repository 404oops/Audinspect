import React, { useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import TitleBar from './components/TitleBar';
import Settings from './components/Settings';
import usePlayerStore from './store/usePlayerStore';
import platform from './platform';

function App() {
  const isSettingsOpen = usePlayerStore((state) => state.isSettingsOpen);
  const openSettings = usePlayerStore((state) => state.openSettings);
  const closeSettings = usePlayerStore((state) => state.closeSettings);

  const handleSettingsClick = () => {
    openSettings();
  };

  // menubar item / cmd+, shortcut
  useEffect(() => platform.onMenuOpenSettings(() => openSettings()), [openSettings]);

  const handleSettingsClose = () => {
    closeSettings();
  };

  return (
    <div className="app-root h-screen bg-pure-black text-white flex flex-col overflow-hidden">
      <TitleBar onSettingsClick={handleSettingsClick} />
      <AudioPlayer />
      {isSettingsOpen && <Settings onClose={handleSettingsClose} />}
    </div>
  );
}

export default App;
