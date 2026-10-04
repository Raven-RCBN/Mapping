import { test } from "node:test";
import assert from "node:assert/strict";
import { activityGroups, exactCoordinates } from "./activities.js";
import { linkedFeatures, interiorPosition } from "./map-placement.js";
import { records } from "./timeline.js";
import Polygon from "../../apps/web/node_modules/ol/geom/Polygon.js";
import MultiPolygon from "../../apps/web/node_modules/ol/geom/MultiPolygon.js";
import Feature from "../../apps/web/node_modules/ol/Feature.js";
test("GPS overrides block anchoring, unknown locations never invent coordinates", () => {
  const rows = [
    { id: "1", estateId: "a", blockId: "x", recordKind: "field" },
    { id: "2", estateId: "a", blockId: "x", recordKind: "harvesting" },
    {
      id: "3",
      estateId: "a",
      blockId: "x",
      geolocation: { type: "Point", coordinates: [101, 3] },
    },
  ];
  assert.deepEqual(
    activityGroups(rows).map((g) => g.rows.length),
    [2, 1]
  );
  assert.equal(exactCoordinates(rows[0]), null);
  assert.deepEqual(exactCoordinates(rows[2]), [101, 3]);
  assert.deepEqual(linkedFeatures(rows[0], [], []), []);
});
test("block placement stays inside a concave polygon and the largest multipart member", () => {
  const concave = new Polygon([
    [
      [0, 0],
      [10, 0],
      [10, 2],
      [2, 2],
      [2, 10],
      [0, 10],
      [0, 0],
    ],
  ]);
  const other = new Polygon([
    [
      [20, 20],
      [21, 20],
      [21, 21],
      [20, 21],
      [20, 20],
    ],
  ]);
  const feature = new Feature({
    geometry: new MultiPolygon([other, concave]),
    estateId: "a",
    blockName: "OP_2006",
  });
  const blocks = [{ id: "b", estateId: "a", mapBlockNames: ["OP_2006"] }];
  const fs = linkedFeatures(
    { estateId: "a", blockId: "b", recordKind: "field" },
    blocks,
    [feature]
  );
  assert.equal(fs.length, 1);
  assert.equal(concave.intersectsCoordinate(interiorPosition(fs)), true);
  assert.equal(interiorPosition([]), null);
  assert.equal(
    linkedFeatures(
      { estateId: "b", blockId: "b", recordKind: "field" },
      blocks,
      [feature]
    ).length,
    0
  );
});
test("exact field descriptions stay separate from harvesting and use workbook dates", () => {
  const data = {
    activities: [
      {
        estateId: "a",
        block: "OP2016",
        type: "Field activity",
        activityDescription: "Harvesters",
        date: "2024-10-04",
      },
      {
        estateId: "a",
        block: "OP2016",
        type: "Harvesting",
        date: "2024-10-04",
      },
    ],
  };
  assert.equal(
    records(data, ["a"], {
      activity: "Field activity",
      fieldActivity: "Harvesters",
      bucket: { start: "2024-10-04", end: "2024-10-05" },
    }).length,
    1
  );
  assert.equal(records(data, ["a"], { fieldActivity: "Spraying" }).length, 0);
});
