/* ===== Service Worker: cache offline + control total ===== */

const CACHE_NAME = "asistencia-v2"; // ⬅️ sube versión cuando cambies algo
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./favicon-16.png"
];

/* ===== INSTALL ===== */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );

  // 🔥 fuerza activación inmediata
  self.skipWaiting();
});

/* ===== ACTIVATE ===== */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 🧹 borrar TODAS las caches viejas
      const keys = await caches.keys();
      await Promise.all(
        keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null))
      );

      // 🧠 tomar control inmediato de todas las pestañas
      await self.clients.claim();
    })()
  );
});

/* ===== FETCH ===== */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          // cachea solo respuestas OK
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // offline fallback

      // devuelve cache primero si existe, si no red
      return cached || fetchPromise;
    })
  );
});

/* ===== KILL SWITCH (desde la app) ===== */
self.addEventListener("message", (event) => {
  if (event.data === "KILL_SW") {
    self.registration.unregister().then(() => {
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          // 🔄 fuerza recarga sin SW
          client.navigate(client.url);
        });
      });
    });
  }
});
