const SHELL = "mapping-shell-__VERSION__";
const FILES = __SHELL_FILES__;
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("mapping-shell-") && name !== SHELL)
          await caches.delete(name);
      await self.clients.claim();
    })()
  )
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== location.origin ||
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(SHELL);
      // Only public app files are cached here. Module requests may add Origin,
      // unlike installation requests; an old server's Vary: Origin must not hide them.
      return (
        (await cache.match(event.request, { ignoreVary: true })) ||
        (event.request.mode === "navigate"
          ? await cache.match("/index.html", { ignoreVary: true })
          : new Response("Not saved offline", { status: 503 }))
      );
    })
  );
});
