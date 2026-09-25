/* Platter's service worker: the app and the recipe library stay on the device, so it opens with no signal
   (a kitchen with bad wifi, say), and photos that have been shown are remembered.

   Everything Platter ships is addressed by a versioned URL (…?v=<mtime>), so a cached copy of one is always
   the right one and is handed back without asking the network. The page itself is asked for first, so a new
   deploy shows up on the next visit. The worker is registered as /sw.js?v=<version>: a new version is a new
   worker with a new cache, and the old cache is deleted when it takes over. */
"use strict";

const V = new URL(self.location.href).searchParams.get("v") || "0";
const APP = `platter-app-${V}`;
const MEDIA = "platter-media-1";          // photos and fonts: they do not change with a deploy, so they outlive one
const MEDIA_MAX = 600;                    // photos kept; the oldest go first

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP);
    const urls = new Set(["/", "/manifest.webmanifest", `/static/data/library.json?v=${V}`, `/static/data/details.json?v=${V}`]);
    try {                                  // whatever the page links to under /static/ is what the app needs
      const html = await (await fetch("/", { cache: "no-store" })).text();
      for (const m of html.matchAll(/(?:src|href)="(\/static\/[^"]+)"/g)) urls.add(m[1]);
    } catch { /* offline while updating: keep what we can */ }
    // one miss must not fail the whole install
    await Promise.all([...urls].map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("platter-app-") && key !== APP) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js" || url.pathname === "/healthz") return;   // never kept
    if (req.mode === "navigate") return event.respondWith(page(req));
    if (url.pathname.startsWith("/static/") && url.searchParams.has("v")) return event.respondWith(versioned(req));
    return event.respondWith(revalidate(req, APP));                                                             // icons, manifest
  }
  if (req.destination === "image") return event.respondWith(photo(req));
  if (/(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname)) event.respondWith(revalidate(req, MEDIA));        // the typeface
});

/** The page: network first, so a deploy shows up at once; the last copy when there is no signal. */
async function page(req) {
  const cache = await caches.open(APP);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) || Response.error();
  }
}

/** A file with ?v= in its URL never changes: cache first. */
async function versioned(req) {
  const cache = await caches.open(APP);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/** Answer from the cache and refresh it in the background. */
async function revalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
  return hit || fresh;
}

/** A photo from another host. Fetched in CORS mode so the copy is readable and counts for its real size (an opaque one
    is charged to the storage quota at several megabytes). A host that does not allow that is just passed through. */
async function photo(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
    if (res.ok) {
      await cache.put(req.url, res.clone());
      const keys = await cache.keys();
      if (keys.length > MEDIA_MAX) await Promise.all(keys.slice(0, keys.length - MEDIA_MAX).map((k) => cache.delete(k)));
    }
    return res;
  } catch {
    return fetch(req).catch(() => Response.error());
  }
}
