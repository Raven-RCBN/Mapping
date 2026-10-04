// Selection applies to map/timeline views, never to the source data tables.
export const allMapActivities = () => ({
  mode: "exclude",
  fields: [],
  harvesting: true,
});
export const noMapActivities = () => ({
  mode: "include",
  fields: [],
  harvesting: false,
});
export function fieldVisible(selection, description) {
  if (!selection) return true;
  const listed = selection.fields.includes(description || "");
  return selection.mode === "include" ? listed : !listed;
}
export function activityVisible(selection, row) {
  if (!selection) return true;
  return row.recordKind === "harvesting" || row.type === "Harvesting"
    ? selection.harvesting
    : fieldVisible(
        selection,
        row.activityDescription || (row.recordKind === "field" ? "" : row.type)
      );
}
export function validMapVisibility(value) {
  return (
    value &&
    ["include", "exclude"].includes(value.mode) &&
    typeof value.harvesting === "boolean" &&
    Array.isArray(value.fields) &&
    value.fields.length <= 500 &&
    value.fields.every((x) => typeof x === "string" && x.length <= 500)
  );
}
