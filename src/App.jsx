import AudioPlayer from './components/AudioPlayer';

function App() {
  return (
    <div className="app-root h-screen" >
      <div className="titlebar" aria-hidden="true" />
      <div className="bg-gray-900 rounded-lg shadow-2xl p-6 h-full flex flex-col">
          <h1 className="text-3xl font-bold text-gray-100 mb-4 text-center">Audinspect</h1>
          <AudioPlayer />
        </div>
    </div>
  );
}

export default App;
