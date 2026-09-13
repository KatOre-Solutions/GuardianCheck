/**
 * Injects a real CACHE_VERSION and shell asset list into dist/sw.js.
 *
 * Runs as part of `npm run build`, after `vite build` has populated dist/.
 * public/sw.js ships as a checked-in template carrying two literal
 * placeholders -- __CACHE_VERSION__ and __PRECACHE_SHELL_URLS__ -- because the
 * worker has to precache index.html and its exact hashed asset bundle(s)
 * atomically per deploy, and Vite only assigns those hashes at build time.
 * There is no dist/.vite/manifest.json (build.manifest isn't enabled), so the
 * asset list is read straight out of the built index.html's own <script>/
 * <link> tags -- whatever Vite actually referenced for this build, not an
 * assumed fixed count of files.
 *
 * CACHE_VERSION is a hash of index.html plus that asset list, so every deploy
 * that changes either automatically gets a new cache name -- the existing
 * activate-time eviction in sw.js drops the old one. This replaces a
 * previously hand-maintained "v1" string nothing enforced.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_HTML_PATH = path.join(ROOT, "dist", "index.html");
const SW_PATH = path.join(ROOT, "dist", "sw.js");

const ASSET_TAG_PATTERN = /<(?:script[^>]*\ssrc|link[^>]*\shref)="(\/assets\/[^"]+\.(?:js|css))"/g;

function readBuiltAssetUrls(indexHtml: string): string[] {
  const urls: string[] = [];
  for (const match of indexHtml.matchAll(ASSET_TAG_PATTERN)) {
    urls.push(match[1]);
  }
  return urls;
}

function main(): void {
  if (!existsSync(INDEX_HTML_PATH)) {
    throw new Error(`${path.relative(ROOT, INDEX_HTML_PATH)} not found — run "vite build" before this script.`);
  }
  if (!existsSync(SW_PATH)) {
    throw new Error(`${path.relative(ROOT, SW_PATH)} not found — expected Vite to copy public/sw.js into dist/.`);
  }

  const indexHtml = readFileSync(INDEX_HTML_PATH, "utf8");
  const assetUrls = readBuiltAssetUrls(indexHtml);

  if (assetUrls.length === 0) {
    throw new Error(
      `No hashed /assets/*.js or /assets/*.css references found in ${path.relative(ROOT, INDEX_HTML_PATH)}. ` +
        `The service worker has nothing to precache alongside the shell — refusing to ship a broken offline path.`,
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
