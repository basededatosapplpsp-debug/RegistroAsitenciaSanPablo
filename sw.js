/* ===== Service Worker: cache offline + control total ===== */

const CACHE_NAME = "asistencia-v64"; // ⬅️ sube versión cuando cambies assets importantes
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
 "./icon-192-v2.png",
"./icon-512-v2.png",
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
      const keys = await caches.keys();
      await Promise.all(
        keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null))
      );

      await self.clients.claim();
    })()
  );
});

/* ===== FETCH ===== */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ✅ solo http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // ✅ no cachear Google Apps Script
  if (url.hostname.includes("script.google.com")) {
    event.respondWith(fetch(req));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isHTMLNavigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname === "/" ||
    url.pathname.endsWith("/");

  // ✅ HTML / navegación: RED PRIMERO, cache como respaldo
  if (isSameOrigin && isHTMLNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type !== "opaque") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // ✅ resto de assets: CACHE PRIMERO
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((res) => {
            if (!res || !res.ok) return res;
            if (res.type === "opaque") return res;

            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});

/* ===== MENSAJES DESDE LA APP ===== */
self.addEventListener("message", (event) => {
  const msg = event.data;

  if (msg === "KILL_SW") {
    self.registration.unregister().then(() => {
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.navigate(client.url);
        });
      });
    });
    return;
  }

  if (msg && msg.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
