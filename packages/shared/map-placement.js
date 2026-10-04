// Takes OpenLayers features already projected for the map.
export function linkedFeatures(record, blocks, features) {
  const block = blocks.find(
    (b) => b.id === record.blockId && b.estateId === record.estateId
  );
  const names = block
    ? block.mapBlockNames || []
    : record.recordKind
    ? []
    : [record.block];
  return features.filter(
    (f) =>
      f.get("estateId") === record.estateId &&
      names.includes(f.get("blockName"))
  );
}
export function interiorPosition(features) {
  const polygons = features
    .flatMap((f) => {
      const g = f.getGeometry();
      return g.getType() === "Polygon"
        ? [g]
        : g.getType() === "MultiPolygon"
        ? g.getPolygons()
        : [];
    })
    .sort((a, b) => b.getArea() - a.getArea());
  return polygons[0]?.getInteriorPoint().getCoordinates().slice(0, 2) || null;
}

// Deterministic display positions for imported rows without GPS. These positions
// are never saved as measured coordinates. Polygon tests respect holes/islands.
export function spreadPositions(features, count) {
  if (!count) return [];
  const polygons = features
    .flatMap((f) => {
      const g = f.getGeometry();
      return g.getType() === "Polygon"
        ? [g]
        : g.getType() === "MultiPolygon"
        ? g.getPolygons()
        : [];
    })
    .filter((g) => g.getArea() > 0)
    .sort((a, b) => b.getArea() - a.getArea());
  if (!polygons.length) return [];
  const candidates = [],
    seen = new Set();
  const add = (p, g) => {
    const key = p.join(",");
    if (!seen.has(key) && g.intersectsCoordinate(p)) {
      seen.add(key);
      candidates.push(p);
    }
  };
  const totalArea = polygons.reduce((n, g) => n + g.getArea(), 0);
  for (const g of polygons)
    add(g.getInteriorPoint().getCoordinates().slice(0, 2), g);
  for (let pass = 0; candidates.length < count * 6 && pass < 4; pass++) {
    const step = Math.sqrt(totalArea / (count * 8 * 2 ** pass));
    for (const g of polygons) {
      const [x0, y0, x1, y1] = g.getExtent();
      const nx = Math.max(1, Math.ceil((x1 - x0) / step)),
        ny = Math.max(1, Math.ceil((y1 - y0) / step));
      // Extremely narrow geometries use the interior segment fallback below.
      if (nx * ny > 16000) continue;
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++)
          add(
            [
              x0 + ((x + 0.5) * (x1 - x0)) / nx,
              y0 + ((y + 0.5) * (y1 - y0)) / ny,
            ],
            g
          );
    }
  }
  if (candidates.length < count) {
    const g = polygons[0],
      [x, y, width] = g.getInteriorPoint().getCoordinates();
    for (let i = 0; i < count * 2; i++)
      add([x + ((i + 0.5) / (count * 2) - 0.5) * width * 0.9, y], g);
  }
  if (!candidates.length) return [];
  // Farthest-point sampling separates bubbles without placing them outside blocks.
  const result = [candidates[0]],
    distances = candidates.map(() => Infinity);
  while (result.length < count && result.length < candidates.length) {
    const last = result.at(-1);
    let best = -1,
      distance = -1;
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      distances[i] = Math.min(
        distances[i],
        (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2
      );
      if (distances[i] > distance) {
        distance = distances[i];
        best = i;
      }
    }
    result.push(candidates[best]);
  }
  return result;
}
