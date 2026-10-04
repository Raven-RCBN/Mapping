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
