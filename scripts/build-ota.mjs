#!/usr/bin/env node
// ── OTA bundle builder ────────────────────────────────────────────────────
// Runs AFTER `vite build`. Packages the freshly built `dist/` into a zip the
// Android app can download, and writes a manifest describing it:
//
//   dist/ota/bundle-<version>.zip   the web build (index.html at the zip root)
//   dist/ota/manifest.json          { version, url, checksum, builtAt }
//
// Both files ship with the site, so `wrangler deploy` publishes the update at
// the same moment the website changes — no separate update server.
//
// Version scheme: `1.<major-ish>.<minutes-since-epoch>`. Minutes are monotonic
// and fit comfortably in a semver patch field, so every build sorts after the
// last one without needing a counter checked into git.
//
// Usage:  npm run build:ota

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OTA_DIR = join(DIST, 'ota');

// Files that must never be inside the OTA bundle. The bundle replaces the
// WebView's asset root, so shipping the previous bundle inside it would
// compound in size on every build.
const EXCLUDED_DIRS = new Set(['ota']);

function main() {
  if (!existsSync(DIST)) {
    console.error('[ota] dist/ not found — run `vite build` first.');
    process.exit(1);
  }
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[ota] dist/index.html not found — the build looks incomplete.');
    process.exit(1);
  }

  // Start clean so old bundles don't accumulate in the deploy.
  rmSync(OTA_DIR, { recursive: true, force: true });
  mkdirSync(OTA_DIR, { recursive: true });

  const version = `1.0.${Math.floor(Date.now() / 60000)}`;
  const zipName = `bundle-${version}.zip`;
  const zipPath = join(OTA_DIR, zipName);

  const zip = new AdmZip();
  let fileCount = 0;

  for (const abs of walk(DIST)) {
    const rel = relative(DIST, abs);
    const [top] = rel.split(sep);
    if (EXCLUDED_DIRS.has(top)) continue;
    // Source maps are dev-only and can double the bundle size.
    if (rel.endsWith('.map')) continue;
    zip.addFile(rel.split(sep).join('/'), readFileSync(abs));
    fileCount++;
  }

  if (fileCount === 0) {
    console.error('[ota] refusing to publish an empty bundle.');
    process.exit(1);
  }

  zip.writeZip(zipPath);

  const bytes = readFileSync(zipPath);
  const checksum = createHash('sha256').update(bytes).digest('hex');

  const manifest = {
    version,
    url: `/ota/${zipName}`,
    checksum,
    builtAt: new Date().toISOString(),
    fileCount,
    sizeBytes: bytes.length,
  };
  writeFileSync(join(OTA_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const kb = (bytes.length / 1024).toFixed(0);
  console.log(`[ota] ${zipName} — ${fileCount} files, ${kb} KB`);
  console.log(`[ota] version ${version}  sha256 ${checksum.slice(0, 16)}…`);
  console.log('[ota] deploy with `npx wrangler deploy` to publish this update.');
}

/** Recursively yield every file path under `dir`. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) yield* walk(abs);
    else yield abs;
  }
}

main();
