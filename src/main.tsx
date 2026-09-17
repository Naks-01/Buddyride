import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './context/AuthContext';

// Force every open tab onto the freshly deployed bundle instead of running stale cached JS forever.
navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload());
const updateSW = registerSW({
  immediate: true,
  // Auto-apply immediately - a confirm() dialog is too easy to miss/dismiss in a standalone PWA,
  // which was silently stranding devices on old JS bundles no matter how many times we deployed.
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log('Ready offline');
  },
});
console.log('AUTO RELOAD ADDED');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
