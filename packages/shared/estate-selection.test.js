import { test } from "node:test";
import assert from "node:assert/strict";
import { oneEstate, mergeEstateWorkspace } from "./estate-selection.js";
test("a saved multi-estate selection becomes one authorised estate", () => {
  const estates = [{ id: "sg" }, { id: "oban" }];
  assert.deepEqual(oneEstate(["oban", "sg"], estates), ["oban"]);
  assert.deepEqual(oneEstate(["deleted", "sg"], estates), ["sg"]);
  assert.deepEqual(oneEstate(null, estates), ["sg"]);
  assert.deepEqual(oneEstate(["sg"], []), []);
});

test("switching map geometry retains both estates' picker counts", () => {
  const estates = [
    { id: "sg", blockCount: 25 },
    { id: "oban", blockCount: 239 },
  ];
  const sg = mergeEstateWorkspace(estates, [
    { id: "sg", boundary: { features: Array(25).fill({}) } },
  ]);
  const oban = mergeEstateWorkspace(sg, [
    { id: "oban", boundary: { features: Array(239).fill({}) } },
  ]);
  assert.deepEqual(
    oban.map((e) => e.blockCount),
    [25, 239]
  );
  assert.equal(oban[0].boundary, undefined);
  assert.equal(oban[1].boundary.features.length, 239);
});
