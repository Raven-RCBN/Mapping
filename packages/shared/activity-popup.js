// Only display activity and mandays. Harvesting records do not supply mandays.
export function popupActivities(rows) {
  const groups = new Map();
  for (const row of rows) {
    const harvesting =
      row.recordKind === "harvesting" || row.type === "Harvesting";
    const activity = harvesting
      ? "Harvesting"
      : row.activityDescription || row.type || "Field activity";
    const key = (harvesting ? "harvesting" : "field") + "\0" + activity;
    if (!groups.has(key)) groups.set(key, { key, activity, mandays: null });
    if (
      !harvesting &&
      typeof row.mandays === "number" &&
      Number.isFinite(row.mandays)
    )
      groups.get(key).mandays = (groups.get(key).mandays ?? 0) + row.mandays;
  }
  return [...groups.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
}
