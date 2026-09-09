/**
 * GuardianCheck service worker.
 *
 * It exists for one reason: Chrome will not offer "Install" without a service
 * worker that answers a navigation while offline. So this does exactly that and
 * nothing more.
 *
 * What it deliberately does NOT do:
 *
 *   - Cache app assets. `/assets/*` filenames are content-hashed and a
 *     deployment replaces them; a cached bundle would happily serve an old
 *     build against a new API until the cache was evicted.
 *   - Touch `/api/*`, Firestore, or Firebase Auth. Check-in state is
 *     safety-critical — a stale roster is worse than an error message, and the
 *     Firestore SDK already runs its own offline persistence underneath.
 *
 * That leaves navigations: try the network, and if the device is offline show
 * the branded offline page instead of the browser's dinosaur.
 *
 * Bump CACHE_VERSION whenever the precached files change. Old caches are
 * dropped on activate, so the bump is the whole invalidation story.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `guardiancheck-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// The offline page and the assets it references. It must render with no
// network at all, so anything it needs has to be here.
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `reload` bypasses the HTTP cache, so a deploy cannot precache the
      // previous build's offline page.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      // No point making users close every tab to pick up a new worker when the
      // worker owns no cached application code.
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

  // Only page loads. Everything else — API calls, Firestore streams, assets —
  // goes to the network untouched by not calling respondWith at all.
  if (request.mode !== "navigate") return;
  if (new URL(request.url).pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        // Offline, or the network died mid-request. Either way the shell can't
        // be fetched, so serve the standalone offline page.
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(OFFLINE_URL);
        return (
          cached ??
          new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});
