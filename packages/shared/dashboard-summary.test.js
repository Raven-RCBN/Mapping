import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRecords, dashboardCardState } from "./dashboard-summary.js";
import { records } from "./timeline.js";
const rows = [
  {
    estateId: "a",
    recordKind: "harvesting",
    type: "Harvesting",
    date: "2025-12-12",
    bunches: 10,
    status: "verified",
  },
  {
    estateId: "a",
    recordKind: "harvesting",
    type: "Harvesting",
    date: "2025-12-13",
    bunches: 15,
    status: "recorded",
  },
  {
    estateId: "a",
    recordKind: "field",
    type: "Field activity",
    activityDescription: "Spraying",
    date: "2025-12-12",
    mandays: 1.5,
    status: "verified",
  },
  {
    estateId: "a",
    recordKind: "field",
    type: "Field activity",
    activityDescription: "Weeding",
    date: "2025-12-12",
    mandays: 2.25,
    status: "recorded",
  },
];
test("card totals retain separate units and selected date scope offline", () => {
  assert.deepEqual(summarizeRecords(rows), {
    count: 4,
    verified: 2,
    pending: 2,
    bunches: 25,
    mandays: 3.75,
  });
  const selected = records({ activities: rows }, ["a"], {
    bucket: { start: "2025-12-12", end: "2025-12-13" },
  });
  assert.deepEqual(summarizeRecords(selected), {
    count: 3,
    verified: 2,
    pending: 1,
    bunches: 10,
    mandays: 3.75,
  });
  const field = records({ activities: rows }, ["a"], {
    mapVisibility: { mode: "include", fields: ["Weeding"], harvesting: false },
  });
  assert.deepEqual(summarizeRecords(field), {
    count: 1,
    verified: 0,
    pending: 1,
    bunches: 0,
    mandays: 2.25,
  });
});
test("cards distinguish loading, failed, empty and stale responses instead of showing false zeros", () => {
  const summary = summarizeRecords(rows);
  const state = {
    online: true,
    expectedKey: "new",
    responseKey: "new",
    loading: false,
    summary,
  };
  assert.equal(
    dashboardCardState({ ...state, responseKey: "old" }).summary,
    null
  );
  assert.equal(
    dashboardCardState({ ...state, loading: true }).status,
    "loading"
  );
  assert.equal(
    dashboardCardState({ ...state, error: "Failed" }).status,
    "error"
  );
  assert.equal(dashboardCardState({ ...state, summary: null }).status, "error");
  assert.equal(dashboardCardState(state).summary.count, 4);
  assert.deepEqual(
    dashboardCardState({ ...state, online: false, offlineRows: rows }).summary,
    summary
  );
  assert.equal(
    dashboardCardState({ ...state, summary: summarizeRecords([]) }).status,
    "ready"
  );
  assert.equal(
    dashboardCardState({ ...state, summary: summarizeRecords([]) }).summary
      .count,
    0
  );
});
