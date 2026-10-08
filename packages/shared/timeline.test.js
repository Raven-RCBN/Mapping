import { test } from "node:test";
import assert from "node:assert/strict";
import { buckets, records, imagesAt } from "./timeline.js";
test("estate IDs separate duplicate block names and totals", () => {
  const data = {
    activities: [
      { estateId: "a", block: "X", type: "Harvesting", date: "2026-09-29" },
      { estateId: "b", block: "X", type: "Weeding", date: "2026-09-29" },
    ],
  };
  assert.equal(records(data, ["a", "b"], { block: "a::X" }).length, 1);
  assert.equal(records(data, ["missing"]).length, 0);
});
test("calendar month and week boundaries", () => {
  assert.deepEqual(buckets("2026-10-03", "week", 1), [
    { start: "2026-09-28", end: "2026-10-05" },
  ]);
  assert.equal(buckets("2024-02-29", "month", 1)[0].end, "2024-03-01");
});
test("imagery never substitutes another estate or a future capture", () => {
  const assets = [
    { id: "1", estateId: "a", kind: "imagery", acquiredAt: "2026-09-29" },
    { id: "2", estateId: "b", kind: "imagery", acquiredAt: "2026-09-01" },
  ];
  assert.deepEqual(imagesAt(assets, ["a"], "2026-09-28"), []);
  assert.equal(imagesAt(assets, ["a", "b"], "2026-10-03").length, 2);
});
test("undated reference mosaics never become a dated satellite capture", () => {
  const assets = [{id:"reference",estateId:"a",kind:"reference-image"},
    {id:"dated",estateId:"a",kind:"imagery",acquiredAt:"2024-01-01"}];
  assert.deepEqual(imagesAt(assets,["a"],"2023-12-31"),[]);
  assert.equal(imagesAt(assets,["a"],"2024-01-02")[0].id,"dated");
});
