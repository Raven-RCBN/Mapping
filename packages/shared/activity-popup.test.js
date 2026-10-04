import { test } from "node:test";
import assert from "node:assert/strict";
import { popupActivities } from "./activity-popup.js";
test("compact offline popup sums mandays per activity and never invents harvesting mandays", () => {
  const result = popupActivities([
    { recordKind: "field", activityDescription: "Spraying", mandays: 2 },
    { recordKind: "field", activityDescription: "Spraying", mandays: 1.5 },
    { recordKind: "field", activityDescription: "Weeding", mandays: 4 },
    { recordKind: "harvesting", bunches: 500, employeeName: "Private name" },
    { type: "Road maintenance", value: 1.2, unit: "km" },
  ]);
  assert.deepEqual(
    result.map(({ activity, mandays }) => ({ activity, mandays })),
    [
      { activity: "Road maintenance", mandays: null },
      { activity: "Spraying", mandays: 3.5 },
      { activity: "Weeding", mandays: 4 },
      { activity: "Harvesting", mandays: null },
    ]
  );
  assert.ok(result.every((r) => !("employeeName" in r) && !("bunches" in r)));
});
