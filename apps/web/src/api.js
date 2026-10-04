import axios from "axios";
export const api = axios.create({
  baseURL: "/api",
  headers: { "X-Mapping-Client": "1" },
  timeout: 60000,
});
let token = "";
export function setToken(value) {
  token = value;
  api.defaults.headers.common.Authorization = value
    ? "Bearer " + value
    : undefined;
}
export async function authorisedFile(url) {
  return (await api.get(url.replace(/^\/api/, ""), { responseType: "blob" }))
    .data;
}
const manifestCache = "mapping-offline-manifest-v1";
let offlineIndex = null;
export async function offlineManifest() {
  const c = await caches.open(manifestCache);
  const r = await c.match("/offline-manifest");
  return r ? await r.json() : null;
}
export async function getSnapshot() {
  try {
    const { data } = await api.get("/snapshot", { timeout: 10000 });
    return { ...data, offline: false };
  } catch (e) {
    if (e.response) throw e;
    const pack = await offlineManifest();
    if (!pack) throw e;
    offlineIndex = pack;
    return { ...pack.snapshot, offline: true };
  }
}
export async function imageBlob(asset) {
  const pack = offlineIndex || (await offlineManifest());
  if (pack?.files.some((f) => f.id === asset.id && f.sha256 === asset.sha256)) {
    const cached = await (await caches.open(pack.cacheName)).match(asset.url);
    if (cached) return cached.blob();
  }
  return authorisedFile(asset.url);
}
export async function saveOffline(ids, onProgress) {
  if (!("serviceWorker" in navigator))
    throw Error(
      "This browser cannot install offline apps. Open the dashboard in Chrome, Safari or the mobile app."
    );
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            Error(
              "Offline app is not ready. Reload the page online, then retry."
            )
          ),
        10000
      )
    ),
  ]);
  const { data: pack } = await api.get("/offline", {
    params: { estates: ids.join(",") },
  });
  const cacheName = "mapping-pack-" + crypto.randomUUID(),
    cache = await caches.open(cacheName);
  try {
    for (let i = 0; i < pack.files.length; i++) {
      const file = pack.files[i],
        blob = await authorisedFile(file.url),
        bytes = await blob.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0")
      ).join("");
      if (hash !== file.sha256)
        throw Error(
          "Downloaded image checksum did not match. Retry the download."
        );
      await cache.put(
        file.url,
        new Response(bytes, { headers: { "Content-Type": file.mime } })
      );
      onProgress(i + 1, pack.files.length);
    }
    const previous = await offlineManifest();
    await (
      await caches.open(manifestCache)
    ).put(
      "/offline-manifest",
      new Response(JSON.stringify({ ...pack, cacheName }))
    );
    if (previous?.cacheName) await caches.delete(previous.cacheName);
    offlineIndex = { ...pack, cacheName };
    return pack;
  } catch (e) {
    await caches.delete(cacheName);
    throw e;
  }
}
export async function clearOffline() {
  const pack = await offlineManifest();
  if (pack) await caches.delete(pack.cacheName);
  await caches.delete(manifestCache);
  offlineIndex = null;
}
export async function downloadAsset(asset) {
  const blob = await imageBlob(asset),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = asset.name + (asset.kind === "qgis" ? ".zip" : ".png");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
