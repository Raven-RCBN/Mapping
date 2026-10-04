// Only confirmed links to polygons in the estate's current boundary are eligible.
export function mappedBlocks(blocks, estates) {
  const names = new Map(
    estates.map((e) => [
      e.id || e._id,
      new Set(
        (e.boundary?.features || [])
          .filter(
            (f) =>
              ["Polygon", "MultiPolygon"].includes(f.geometry?.type) &&
              f.geometry.coordinates?.length
          )
          .map((f) => f.properties?.blockName)
      ),
    ])
  );
  return blocks.filter((b) =>
    (b.mapBlockNames || []).some((name) => names.get(b.estateId)?.has(name))
  );
}
export function mappedRecords(rows, blocks, estates) {
  const links = new Set(
    mappedBlocks(blocks, estates).map((b) => `${b.estateId}::${b.id || b._id}`)
  );
  return rows.filter((r) => links.has(`${r.estateId}::${r.blockId}`));
}
export const recordKey = (r) => `${r.recordKind}:${r.id}`;
export const activityName = (r) =>
  r.recordKind === "harvesting"
    ? r.activity || "Harvesting"
    : r.activityDescription || r.type || "Field activity";
export const compareMapRecords = (a, b) =>
  a.date === b.date
    ? a.id === b.id
      ? a.recordKind < b.recordKind
        ? 1
        : a.recordKind > b.recordKind
        ? -1
        : 0
      : a.id < b.id
      ? 1
      : -1
    : a.date < b.date
    ? 1
    : -1;
