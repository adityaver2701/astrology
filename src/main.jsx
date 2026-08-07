import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initSentry } from './sentry.js'
import { initNative } from './native/index.js'

initSentry()

// Native (Android/Capacitor) integrations. No-op in the browser, and it never
// blocks first paint — a failure here must not take the whole app down.
initNative().catch((err) => console.warn('initNative failed', err))

// Self-heal stale tabs after a redeploy. When the app is rebuilt, lazy-loaded
// chunks get new hashed filenames and the old ones are removed from the server.
// A tab opened before the deploy still references the old hashes, so the next
// dynamic import() 404s with "Failed to fetch dynamically imported module".
// Vite fires `vite:preloadError` in that case — reload once to pull the fresh
// index.html + current chunk names. A sessionStorage guard prevents reload loops
// if the failure is something other than a stale deploy.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('astro_reloaded_for_chunk') === '1') return;
  sessionStorage.setItem('astro_reloaded_for_chunk', '1');
  window.location.reload();
});
// Clear the guard once the app has loaded successfully so future deploys can
// trigger a fresh one-shot reload.
window.addEventListener('load', () => {
  sessionStorage.removeItem('astro_reloaded_for_chunk');
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
