export type Fix = {
  longitude: number;
  latitude: number;
  accuracy: number;
  timestamp: number;
  demo?: boolean;
};
export type Nearby = {
  center: [number, number];
  savedAt: number;
  geojson: any;
};
export const locationCache = "mapintel-preview-location-v1";
export async function savedNearby(): Promise<Nearby | null> {
  const r = await (await caches.open(locationCache)).match("/__nearby_map__");
  return r ? await r.json() : null;
}
export async function downloadNearby(fix: Fix): Promise<Nearby> {
  if (fix.demo)
    throw Error("A preview location never requests a real location map.");
  // A single bounded query, requested by the user. No background tracking or tiles.
  const lat = fix.latitude,
    lon = fix.longitude,
    dy = 0.0045,
    dx = dy / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const bbox = [
    Math.max(-90, lat - dy),
    Math.max(-180, lon - dx),
    Math.min(90, lat + dy),
    Math.min(180, lon + dx),
  ]
    .map((n) => n.toFixed(6))
    .join(",");
  const query = `[out:json][timeout:20][maxsize:8388608];(way[highway](${bbox});way[building](${bbox});way[waterway](${bbox});way[natural=water](${bbox}););out geom;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw Error(
      "Nearby map service unavailable. The previous saved area is unchanged.",
    );
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024)
    throw Error("Nearby map is too large. The previous area is unchanged.");
  const data = JSON.parse(text);
  if (data.remark)
    throw Error("Nearby map request was incomplete. Please retry later.");
  const features = (data.elements || [])
    .filter((r: any) => r.type === "way" && r.geometry?.length > 1)
    .map((r: any) => {
      const coordinates = r.geometry.map((p: any) => [p.lon, p.lat]);
      const closed =
        coordinates.length >= 4 &&
        coordinates[0][0] === coordinates.at(-1)[0] &&
        coordinates[0][1] === coordinates.at(-1)[1];
      const polygon =
        closed && (r.tags?.building || r.tags?.natural === "water");
      return {
        type: "Feature",
        properties: {
          kind: r.tags?.highway
            ? "road"
            : r.tags?.building
              ? "building"
              : "water",
          name: r.tags?.name || "",
        },
        geometry: {
          type: polygon ? "Polygon" : "LineString",
          coordinates: polygon ? [coordinates] : coordinates,
        },
      };
    });
  const result: Nearby = {
    center: [lon, lat],
    savedAt: Date.now(),
    geojson: { type: "FeatureCollection", features },
  };
  await (
    await caches.open(locationCache)
  ).put("/__nearby_map__", new Response(JSON.stringify(result)));
  return result;
}
