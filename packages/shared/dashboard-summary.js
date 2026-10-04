// Counts refer to records, while harvesting and field work have different units.
export function summarizeRecords(rows) {
  const summary = {
    count: rows.length,
    verified: 0,
    bunches: 0,
    mandays: 0,
    pending: 0,
  };
  for (const row of rows) {
    if (row.status === "verified") summary.verified++;
    if (row.recordKind === "harvesting")
      summary.bunches += Number(row.bunches) || 0;
    if (row.recordKind === "field") summary.mandays += Number(row.mandays) || 0;
  }
  summary.pending = summary.count - summary.verified;
  return summary;
}

export function dashboardCardState({
  online,
  expectedKey,
  responseKey,
  loading,
  error,
  summary,
  offlineRows,
}) {
  if (!online)
    return { status: "ready", summary: summarizeRecords(offlineRows) };
  // Never display the previous selection or coerce a missing response to zero.
  if (expectedKey !== responseKey || loading)
    return { status: "loading", summary: null };
  if (error || !summary) return { status: "error", summary: null };
  return { status: "ready", summary };
}
