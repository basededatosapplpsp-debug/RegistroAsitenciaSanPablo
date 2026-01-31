/* ===== Service Worker: NO-PERSIST (network-only) ===== */

const CACHE_PREFIX = "asistencia-"; // por si cambias nombres/versions

self.addEventListener("install", (event) => {
  // Activa de inmediato
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Borra TODAS las caches de esta app (y versiones anteriores)
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX))
        .map((k) => caches.delete(k))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo http/https y solo GET (lo demás ni lo tocamos)
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Siempre a red, nunca cache
  event.respondWith(fetch(req));
});

/* ===== KILL SWITCH (desde la app) ===== */
self.addEventListener("message", (event) => {
  if (event.data === "KILL_SW") {
    self.registration.unregister().then(() => {
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
    });
  }
});
