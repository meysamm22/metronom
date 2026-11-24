import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
// Fonts are bundled (not loaded from a CDN) so the app looks right offline.
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { installGlobalHandlers } from './report';
import { initSentry } from './sentry';

initSentry();
installGlobalHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// The native app ships all assets in the binary; the service worker is only
// for the web/PWA deployment.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
