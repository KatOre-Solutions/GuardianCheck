/**
 * Injects a real CACHE_VERSION and shell asset list into dist/sw.js.
 *
 * Runs as part of `npm run build`, after `vite build` has populated dist/.
 * public/sw.js ships as a checked-in template carrying two literal
 * placeholders -- __CACHE_VERSION__ and __PRECACHE_SHELL_URLS__ -- because the
 * worker has to precache index.html and its exact hashed assets atomically per
 * deploy, and Vite only assigns those hashes at build time.
 *
 * The asset list is every JS and CSS file in dist/assets, not only the ones
 * index.html references. Routes are lazy chunks (#43): index.html names just
 * the entry chunk, and a precache built from its tags alone would leave, say,
 * ParentDashboard's chunk uncached -- so a parent's cold offline launch would
 * boot the shell and then fail to load the one screen it exists to show. The
 * whole build is the unit that has to move together.
 *
 * CACHE_VERSION is a hash of index.html plus that asset list, so every deploy
 * that changes either automatically gets a new cache name -- the existing
 * activate-time eviction in sw.js drops the old one. This replaces a
 * previously hand-maintained "v1" string nothing enforced.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_HTML_PATH = path.join(ROOT, "dist", "index.html");
const SW_PATH = path.join(ROOT, "dist", "sw.js");
const ASSETS_DIR = path.join(ROOT, "dist", "assets");

const ASSET_TAG_PATTERN = /<(?:script[^>]*\ssrc|link[^>]*\shref)="(\/assets\/[^"]+\.(?:js|css))"/g;

/** The assets index.html itself loads -- used only to check the full list covers them. */
function readReferencedAssetUrls(indexHtml: string): string[] {
  return Array.from(indexHtml.matchAll(ASSET_TAG_PATTERN), (match) => match[1]);
}

/** Every built JS/CSS file, sorted so the list (and so the hash) is stable. */
function readAllAssetUrls(): string[] {
  if (!existsSync(ASSETS_DIR)) return [];
  return readdirSync(ASSETS_DIR)
    .filter((name) => /\.(?:js|css)$/.test(name))
    .sort()
    .map((name) => `/assets/${name}`);
}

function main(): void {
  if (!existsSync(INDEX_HTML_PATH)) {
    throw new Error(`${path.relative(ROOT, INDEX_HTML_PATH)} not found — run "vite build" before this script.`);
  }
  if (!existsSync(SW_PATH)) {
    throw new Error(`${path.relative(ROOT, SW_PATH)} not found — expected Vite to copy public/sw.js into dist/.`);
  }

  const indexHtml = readFileSync(INDEX_HTML_PATH, "utf8");
  const assetUrls = readAllAssetUrls();

  if (assetUrls.length === 0) {
    throw new Error(
      `No /assets/*.js or /assets/*.css files found in ${path.relative(ROOT, ASSETS_DIR)}. ` +
        `The service worker has nothing to precache alongside the shell — refusing to ship a broken offline path.`,
    );
  }

  const missing = readReferencedAssetUrls(indexHtml).filter((url) => !assetUrls.includes(url));
  if (missing.length > 0) {
    throw new Error(
      `${path.relative(ROOT, INDEX_HTML_PATH)} references assets that are not in ${path.relative(ROOT, ASSETS_DIR)}: ${missing.join(", ")}`,
    );
  }

  const shellUrls = ["/index.html", ...assetUrls];
  const cacheVersion = createHash("sha256")
    .update(indexHtml)
    .update(JSON.stringify(shellUrls))
    .digest("hex")
    .slice(0, 16);

  let sw = readFileSync(SW_PATH, "utf8");

  if (!sw.includes("__CACHE_VERSION__")) {
    throw new Error(`__CACHE_VERSION__ placeholder not found in ${path.relative(ROOT, SW_PATH)} — has public/sw.js drifted from this script?`);
  }
  if (!sw.includes("__PRECACHE_SHELL_URLS__")) {
    throw new Error(`__PRECACHE_SHELL_URLS__ placeholder not found in ${path.relative(ROOT, SW_PATH)} — has public/sw.js drifted from this script?`);
  }

  sw = sw.replace(/__CACHE_VERSION__/g, cacheVersion);
  sw = sw.replace("__PRECACHE_SHELL_URLS__", JSON.stringify(shellUrls).slice(1, -1));

  writeFileSync(SW_PATH, sw, "utf8");
  console.log(`sw.js: CACHE_VERSION=${cacheVersion}, precaching ${shellUrls.length} shell URL(s) -> ${path.relative(ROOT, SW_PATH)}`);
}

main();
