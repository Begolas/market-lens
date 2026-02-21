import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Hotfix: disable old SW cache path to avoid stale app bundles blocking data fixes.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
}
if ('caches' in window) {
  caches.keys().then((keys) => {
    keys.filter((k) => k.startsWith('market-lens-')).forEach((k) => caches.delete(k));
  }).catch(() => {});
}
