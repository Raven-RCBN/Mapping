// Worksheet rows remain in separate collections. This is a read-only map view.
export const normalizeBlockCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[ _]/g, "");
export function activityView(row, recordKind) {
  const { _id, __v, ...rest } = row;
  const harvesting = recordKind === "harvesting";
  return {
    ...rest,
    id: _id || row.id,
    recordKind,
    block: row.blockCode || "",
    date: row.workDate,
    observed_at: row.workDate,
    type: harvesting ? "Harvesting" : "Field activity",
    value: harvesting ? row.bunches : row.mandays,
    unit: harvesting ? "bunches" : "mandays",
    quantity: `${harvesting ? row.bunches : row.mandays} ${
      harvesting ? "bunches" : "mandays"
    }`,
  };
}
export function exactCoordinates(record) {
  const g = record.geolocation;
  return g?.type === "Point" &&
    Array.isArray(g.coordinates) &&
    g.coordinates.length === 2 &&
    g.coordinates.every(Number.isFinite) &&
    Math.abs(g.coordinates[0]) <= 180 &&
    Math.abs(g.coordinates[1]) <= 90
    ? g.coordinates
    : null;
}
export function activityGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const point = exactCoordinates(row);
    const key = `${row.estateId}::${
      row.blockId || row.block || "unassigned"
    }::${point ? point.join(",") : "block"}`;
    if (!groups.has(key))
      groups.set(key, {
        id: key,
        estateId: row.estateId,
        blockId: row.blockId,
        block: row.block,
        geolocation: point,
        rows: [],
        locationSource: point ? "gps" : "block",
      });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
export function groupSummary(group) {
  const harvest = group.rows.filter((r) => r.recordKind === "harvesting");
  const field = group.rows.filter((r) => r.recordKind === "field");
  return (
    [
      harvest.length &&
        `${harvest
          .reduce((n, r) => n + r.bunches, 0)
          .toLocaleString()} bunches`,
      field.length &&
        `${field.reduce((n, r) => n + r.mandays, 0).toLocaleString()} mandays`,
    ]
      .filter(Boolean)
      .join(" · ") || `${group.rows.length} records`
  );
}
