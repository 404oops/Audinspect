import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { hydrateSettings } from './platform/settingsStorage';
import { initPlatform } from './platform';

async function boot() {
  // the store reads its settings synchronously when its module is first
  // evaluated, so the puter.kv copy has to be in localStorage before App
  // (and with it the store) is imported
  try {
    await hydrateSettings();
  } catch (e) {
    console.warn('settings hydration failed:', e);
  }
  initPlatform();

  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

boot();
