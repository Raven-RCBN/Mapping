// Exports only mapped geometry and block names, never activity or employee data.
const xml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      }[c])
  );
export const boundaryName = (feature, index) =>
  String(
    feature.properties?.blockName ||
      feature.properties?.name ||
      `Block ${index + 1}`
  );

function ringCoordinates(ring) {
  if (!Array.isArray(ring) || ring.length < 3)
    throw new Error("A boundary has an incomplete coordinate ring.");
  const result = ring.map((position) => {
    const [lng, lat] = position || [];
    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      Math.abs(lng) > 180 ||
      Math.abs(lat) > 90
    ) {
      throw new Error(
        "Boundary coordinates must use WGS84 longitude and latitude."
      );
    }
    return [lng, lat];
  });
  const first = result[0],
    last = result.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) result.push([...first]);
  if (new Set(result.map((p) => p.join(","))).size < 3)
    throw new Error("A boundary needs at least three distinct coordinates.");
  return result;
}

export function exportBoundary(estate, featureIndex = null) {
  const all = estate?.boundary?.features || [];
  if (!all.length)
    throw new Error("No mapped boundaries are available for this estate.");
  const selection =
    featureIndex === null
      ? all.map((feature, index) => ({ feature, index }))
      : Number.isInteger(featureIndex) && all[featureIndex]
      ? [{ feature: all[featureIndex], index: featureIndex }]
      : [];
  if (!selection.length)
    throw new Error("The selected block is no longer available.");
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity,
    vertices = 0;
  const placemarks = selection.map(({ feature, index }) => {
    const geometry = feature.geometry;
    const polygons =
      geometry?.type === "Polygon"
        ? [geometry.coordinates]
        : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : null;
    if (!polygons?.length)
      throw new Error(
        `${boundaryName(feature, index)} has no polygon boundary.`
      );
    const parts = polygons.map((polygon) => {
      if (!polygon?.length) throw new Error("A boundary has no outer ring.");
      const rings = polygon
        .map((ring, ringIndex) => {
          const coordinates = ringCoordinates(ring);
          for (const [lng, lat] of coordinates) {
            west = Math.min(west, lng);
            east = Math.max(east, lng);
            south = Math.min(south, lat);
            north = Math.max(north, lat);
          }
          vertices += coordinates.length;
          const tag = ringIndex === 0 ? "outerBoundaryIs" : "innerBoundaryIs";
          return `<${tag}><LinearRing><coordinates>${coordinates
            .map(([lng, lat]) => `${lng},${lat},0`)
            .join(" ")}</coordinates></LinearRing></${tag}>`;
        })
        .join("");
      return `<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>${rings}</Polygon>`;
    });
    return `<Placemark><name>${xml(
      boundaryName(feature, index)
    )}</name><styleUrl>#estate-boundary</styleUrl>${
      parts.length === 1
        ? parts[0]
        : `<MultiGeometry>${parts.join("")}</MultiGeometry>`
    }</Placemark>`;
  });
  const title =
    featureIndex === null
      ? `${estate.name} · All mapped blocks`
      : `${estate.name} · ${boundaryName(all[featureIndex], featureIndex)}`;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(
    title
  )}</name><Style id="estate-boundary"><LineStyle><color>ff37c8ed</color><width>2</width></LineStyle><PolyStyle><color>2237c8ed</color><fill>1</fill><outline>1</outline></PolyStyle></Style>${placemarks.join(
    "\n"
  )}</Document></kml>`;
  return {
    kml,
    count: selection.length,
    vertices,
    location: `${((south + north) / 2).toFixed(6)}, ${(
      (west + east) /
      2
    ).toFixed(6)}`,
    filename: `${
      title.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") ||
      "estate-boundary"
    }.kml`,
  };
}
