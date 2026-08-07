import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.wrangler/` is wrangler's build cache — bundled, generated output that
  // fails every style rule and is not ours to fix. Without this, `npm run lint`
  // starts failing the moment anyone runs `wrangler dev`.
  // `android/` is the generated Capacitor native project (see ANDROID_SETUP.md).
  // `public/` is copied verbatim into the build — static assets and vendored
  // minified files, never linted as source.
  globalIgnores(['dist', '.wrangler', 'android', 'public']),
  {
    // Node-context config files, build scripts, and the Cloudflare Worker
    // (which has fetch/caches like a service worker plus console etc.).
    files: [
      'vite.config.js',
      'playwright.config.js',
      'worker/**/*.js',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
