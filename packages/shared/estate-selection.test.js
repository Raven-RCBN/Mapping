import { test } from "node:test";
import assert from "node:assert/strict";
import { oneEstate } from "./estate-selection.js";
test("a saved multi-estate selection becomes one authorised estate", () => {
  const estates = [{ id: "sg" }, { id: "oban" }];
  assert.deepEqual(oneEstate(["oban", "sg"], estates), ["oban"]);
  assert.deepEqual(oneEstate(["deleted", "sg"], estates), ["sg"]);
  assert.deepEqual(oneEstate(null, estates), ["sg"]);
  assert.deepEqual(oneEstate(["sg"], []), []);
});
