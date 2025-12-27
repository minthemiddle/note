const CACHE_NAME = "notizen-v2";
const ASSETS_TO_CACHE = [
    "/",
    "/index.html",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-192.png",
    "/icon-maskable-512.png",
    "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
    // Handle share target URL - redirect to index with params
    const url = new URL(event.request.url);
    if (url.pathname === "/share") {
        // Redirect /share?params to /?params so index.html handles it
        const redirectUrl = "/" + url.search;
        event.respondWith(Response.redirect(redirectUrl, 303));
        return;
    }

    // Network-first for HTML, cache-first for assets
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match("/index.html");
            })
        );
    } else {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request);
            })
        );
    }
});
