import axios from "axios";
export const apiBase = import.meta.env.VITE_API_BASE || "/api";
const namespace = "estate-atlas-" + encodeURIComponent(import.meta.env.BASE_URL);
export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  headers: { "X-Mapping-Client": "1" },
  timeout: 60000,
});
let token = "";
api.interceptors.request.use((config) => {
  const sessionToken = token || (import.meta.env.VITE_AGRINEXUS_SESSION === "true" ? localStorage.getItem("token") : "");
  if (sessionToken && !["null", "undefined"].includes(sessionToken)) config.headers.Authorization = "Bearer " + sessionToken;
  return config;
});
export function setToken(value) {
  token = value;
  api.defaults.headers.common.Authorization = value
    ? "Bearer " + value
    : undefined;
}
export async function authorisedFile(url) {
  const path = new URL(url, location.origin);
  if (path.origin !== location.origin || !path.pathname.startsWith(apiBase + "/")) throw Error("Invalid map resource URL");
  return (await api.get(path.pathname.slice(apiBase.length) + path.search, { responseType: "blob" }))
    .data;
}
const manifestCache = namespace + "-manifest-v1";
let offlineIndex = null;
export async function offlineManifest() {
  const c = await caches.open(manifestCache);
  const r = await c.match(import.meta.env.BASE_URL + "offline-manifest");
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
  const cacheName = namespace + "-pack-" + crypto.randomUUID(),
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
      import.meta.env.BASE_URL + "offline-manifest",
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
