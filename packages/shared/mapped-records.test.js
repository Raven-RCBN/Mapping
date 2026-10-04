import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mappedRecords,
  mappedBlocks,
  activityName,
  recordKey,
} from "./mapped-records.js";
import { spreadPositions } from "./map-placement.js";
import { records } from "./timeline.js";
import Polygon from "../../apps/web/node_modules/ol/geom/Polygon.js";
import MultiPolygon from "../../apps/web/node_modules/ol/geom/MultiPolygon.js";
import Feature from "../../apps/web/node_modules/ol/Feature.js";

test("offline matching requires confirmed names, correct estate, and existing polygons", () => {
  const estates = [
    {
      id: "a",
      boundary: {
        features: [
          {
            properties: { blockName: "B" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [10, 0],
                  [10, 10],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
    },
  ];
  const blocks = [
    { id: "b", estateId: "a", mapBlockNames: ["B"] },
    { id: "u", estateId: "a", mapBlockNames: [] },
    { id: "s", estateId: "a", mapBlockNames: ["old"] },
  ];
  const activities = [
    {
      id: "one",
      estateId: "a",
      blockId: "b",
      recordKind: "field",
      activityDescription: "Weeding",
      date: "2026-07-01",
      mandays: 2,
    },
    { id: "two", estateId: "a", blockId: "u" },
    { id: "three", estateId: "a", blockId: "s" },
    { id: "four", estateId: "b", blockId: "b" },
  ];
  assert.equal(mappedBlocks(blocks, estates).length, 1);
  assert.deepEqual(
    mappedRecords(activities, blocks, estates).map((r) => r.id),
    ["one"]
  );
  assert.deepEqual(
    records({ activities, blocks, estates }, ["a"], { mappedOnly: true }).map(
      (r) => r.id
    ),
    ["one"]
  );
  assert.equal(activities.length, 4);
  assert.equal(activityName(activities[0]), "Weeding");
  assert.equal(
    activityName({ recordKind: "harvesting", activity: "FFB collection" }),
    "FFB collection"
  );
  assert.notEqual(
    recordKey({ id: "same", recordKind: "field" }),
    recordKey({ id: "same", recordKind: "harvesting" })
  );
});
test("20 imported records have 20 distinct points inside concave blocks, holes and islands", () => {
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
  const donut = new Polygon([
    [
      [20, 0],
      [40, 0],
      [40, 20],
      [20, 20],
      [20, 0],
    ],
    [
      [24, 4],
      [24, 16],
      [36, 16],
      [36, 4],
      [24, 4],
    ],
  ]);
  const narrow = new Polygon([
    [
      [0, 0],
      [1000, 0],
      [1000, 0.01],
      [0, 0.01],
      [0, 0],
    ],
  ]);
  for (const geometry of [
    concave,
    donut,
    narrow,
    new MultiPolygon([concave.clone(), donut.clone()]),
  ]) {
    const f = new Feature({ geometry });
    const points = spreadPositions([f], 20);
    assert.equal(points.length, 20);
    assert.equal(new Set(points.map((p) => p.join(","))).size, 20);
    assert.ok(points.every((p) => geometry.intersectsCoordinate(p)));
    assert.deepEqual(points, spreadPositions([f], 20));
  }
  assert.deepEqual(spreadPositions([], 20), []);
  assert.deepEqual(
    spreadPositions([new Feature({ geometry: concave })], 0),
    []
  );
});
