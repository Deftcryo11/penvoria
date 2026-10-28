"use strict";

// Change this value for each future PWA release.
const CACHE_NAME = "penvoria-shell-v1.1-02";
const CACHE_PREFIX = "penvoria-shell-";

const OFFLINE_URL = new URL("./offline.html", self.registration.scope).href;

// Only public, same-origin application files.
// Never cache Supabase responses or financial data.
const STATIC_FILES = new Set([
  "theme.js",
  "style.css",
  "features.css",
  "recurring.css",
  "config.js",
  "app.js",
  "features.js",
  "recurring.js",
  "cloud.js",
  "conflict-recovery.js",
  "export.js",
  "report-range.js",
  "pwa.js",
  "favicon.svg",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "modal-scroll-lock.js",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await cache.add(OFFLINE_URL);

      // Wait for user approval before activating updates.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "PENVORIA_APPLY_UPDATE") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // No third-party or Supabase request interception.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation requires network access.
  // Offline navigation shows an explanatory page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const offline = await caches.match(OFFLINE_URL);

          return (
            offline ||
            new Response("Penvoria is offline", {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
              },
            })
          );
        }
      })(),
    );

    return;
  }

  // Cache only known public static assets.
  const scopePath = new URL(self.registration.scope).pathname;

  if (!url.pathname.startsWith(scopePath)) {
    return;
  }

  const relative = url.pathname.slice(scopePath.length);

  if (!STATIC_FILES.has(relative)) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAME);

          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })(),
  );
});
