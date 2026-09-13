/**
 * GuardianCheck service worker.
 *
 * Precaches the app shell -- index.html and the exact hashed JS/CSS bundle(s)
 * Vite produced for this deploy -- so an installed app can boot with no
 * network at all, not just answer a failed navigation with a static page.
 *
 * Why this changed from an earlier, deliberately minimal worker that only
 * cached offline.html: `/assets/*` filenames are content-hashed and a new
 * deploy replaces them, so precaching them naively risked serving a shell
 * pinned to one build's asset hashes against a server that had already moved
 * on -- a worse failure (white screen) than the honest offline page. That
 * risk is closed here, not ignored: CACHE_VERSION is derived at build time
 * (scripts/generate-sw-precache.ts) from a hash of index.html and its asset
 * list, so *every* deploy that changes either gets an automatically fresh
 * cache name, and the activate handler below drops every other cache name on
 * activation. Shell and assets always move together, as one cache, or not at
 * all -- `cache.addAll` during install fails atomically if any one of them
 * can't be fetched, leaving the previous (fully-populated) worker in charge.
 *
 * What this still deliberately does NOT do:
 *
 *   - Touch `/api/*`, Firestore, or Firebase Auth. Check-in state is
 *     safety-critical -- a stale roster is worse than an error message, and
 *     the Firestore SDK already runs its own offline persistence underneath.
 *   - Decide what any given role sees offline. That's an application-layer
 *     decision (see src/pages/ParentDashboard.tsx's offline branch) made once
 *     the shell has actually booted -- this worker's only job is making sure
 *     it can.
 *
 * CACHE_VERSION and the precache URL list below are placeholders replaced at
 * build time. If you're reading literal "__CACHE_VERSION__" text in a
 * deployed dist/sw.js, the build's postbuild step did not run.
 */

const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `guardiancheck-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// The offline page, the app shell, and the shell's own hashed assets -- every
// URL here must be servable with zero network, because together they're what
// "the app boots offline" actually means.
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg", __PRECACHE_SHELL_URLS__];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `reload` bypasses the HTTP cache, so a deploy cannot precache the
      // previous build's files under this build's cache name.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      // No point making users close every tab to pick up a new worker --
      // shell + assets for this version are already fully cached above.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          // Offline, or the network died mid-request. Serve this version's
          // cached shell so the app can still boot; only fall back to the
          // static offline page if even the shell was never cached (a device
          // that installed the app but never got a first successful load).
          const cache = await caches.open(CACHE_NAME);
          const shell = await cache.match("/index.html");
          if (shell) return shell;
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Non-navigation same-origin requests: serve from this version's cache when
  // present (the shell's own <script>/<link> requests, once offline, land
  // here), otherwise let them reach the network untouched as before.
  if (request.method === "GET") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        return fetch(request);
      })(),
    );
  }
});
