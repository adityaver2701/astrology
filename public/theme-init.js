// Applies the saved (or OS) colour theme before the app's JS bundle loads, so
// dark-theme users don't see a flash of the light theme on every page load.
// Must stay a separate file: the CSP (worker/index.js) blocks inline scripts.
// App.jsx keeps owning the theme after mount; this only sets the first paint.
(function () {
  try {
    var saved = localStorage.getItem('astro_theme');
    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* storage blocked — App.jsx falls back on mount */ }
})();
