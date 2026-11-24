/* Sapludu service worker.
 *
 * Strategy
 *   - App shell / pages ........ network-first, fall back to cache, then to /offline.html
 *   - /_next/static/* (hashed) .. cache-first (immutable)
 *   - icons, images, fonts ...... stale-while-revalidate
 *   - everything cross-origin ... NOT touched: Google sign-in, the Apps Script API and the multiplayer socket always
 *     go straight to the network, so the app can never show stale or fake online data.
 *   - non-GET requests are never cached.
 */
const VERSION = "v1.0.0";
const SHELL = `sapludu-shell-${VERSION}`;
const STATIC = `sapludu-static-${VERSION}`;
const RUNTIME = `sapludu-runtime-${VERSION}`;
const BASE = new URL("./", self.location).pathname; // "/" or "/repo-name/"

const PRECACHE = ["", "offline.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg"].map((p) => BASE + p);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, STATIC, RUNTIME]);
      for (const k of await caches.keys()) if (k.startsWith("sapludu-") && !keep.has(k)) await caches.delete(k);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, cacheName, preload) {
  const cache = await caches.open(cacheName);
  try {
    const res = (preload && (await preload)) || (await fetch(request));
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API / Google / sockets: network only
  if (!url.pathname.startsWith(BASE)) return;

  // page navigations
  if (req.mode === "navigate") {
    event.respondWith(
      networkFirst(req, SHELL, event.preloadResponse).catch(async () => {
        const shell = await caches.match(BASE, { ignoreSearch: true });
        return shell || (await caches.match(BASE + "offline.html")) || Response.error();
      })
    );
    return;
  }

  // immutable hashed build assets
  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // icons / images / fonts / manifest: stale-while-revalidate
  if (/\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        const refresh = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        });
        return hit || refresh;
      })
    );
    return;
  }

  // other same-origin GETs (RSC payloads, json): network-first with cache fallback
  event.respondWith(networkFirst(req, RUNTIME).catch(() => caches.match(req)));
});
