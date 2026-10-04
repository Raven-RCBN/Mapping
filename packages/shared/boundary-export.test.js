import test from "node:test";
import assert from "node:assert/strict";
import { exportBoundary } from "./boundary-export.js";
const outer = [
  [101, 3],
  [102, 3],
  [102, 4],
  [101, 4],
  [101, 3],
];
const hole = [
  [101.2, 3.2],
  [101.2, 3.3],
  [101.3, 3.3],
  [101.2, 3.2],
];
const feature = (name, coordinates, type = "Polygon") => ({
  type: "Feature",
  properties: { blockName: name, employeeName: "PRIVATE" },
  geometry: { type, coordinates },
});
const estate = (features) => ({
  name: "Sungai & Gumut",
  boundary: { type: "FeatureCollection", features },
});
test("KML keeps full polygon coordinates, holes, names and excludes operational data", () => {
  const source = estate([feature("A < B", [outer, hole])]);
  const before = JSON.stringify(source);
  const result = exportBoundary(source);
  assert.equal(result.count, 1);
  assert.equal(result.location, "3.500000, 101.500000");
  assert.match(result.kml, /xmlns="http:\/\/www.opengis.net\/kml\/2.2"/);
  assert.match(result.kml, /Sungai &amp; Gumut/);
  assert.match(result.kml, /A &lt; B/);
  assert.match(result.kml, /<innerBoundaryIs>/);
  assert.match(result.kml, /101,3,0 102,3,0 102,4,0 101,4,0 101,3,0/);
  assert.doesNotMatch(result.kml, /PRIVATE|employeeName/);
  assert.equal(JSON.stringify(source), before);
});
test("multipart blocks remain one named placemark and close unclosed rings", () => {
  const result = exportBoundary(
    estate([feature("F8/F9A", [[outer.slice(0, -1)], [outer]], "MultiPolygon")])
  );
  assert.equal((result.kml.match(/<Placemark>/g) || []).length, 1);
  assert.equal((result.kml.match(/<Polygon>/g) || []).length, 2);
  assert.match(result.kml, /<MultiGeometry>/);
  assert.equal(result.vertices, 10);
});
test("exports are scoped to the provided estate and selected block", () => {
  const source = estate([feature("A", [outer]), feature("B", [outer])]);
  assert.equal(exportBoundary(source).count, 2);
  const single = exportBoundary(source, 1);
  assert.equal(single.count, 1);
  assert.match(single.kml, /<name>B<\/name>/);
  assert.doesNotMatch(single.kml, /<name>A<\/name>/);
  assert.throws(() => exportBoundary(source, 50), /no longer/);
  assert.doesNotMatch(single.filename, /[\/<>]/);
});
test("rejects empty, nonpolygon and invalid coordinates rather than exporting misleading boundaries", () => {
  assert.throws(() => exportBoundary(estate([])), /No mapped/);
  assert.throws(
    () => exportBoundary(estate([feature("A", [1, 2], "Point")])),
    /no polygon/
  );
  for (const bad of [NaN, Infinity, 181, "101"]) {
    assert.throws(
      () =>
        exportBoundary(
          estate([
            feature("A", [
              [
                [bad, 3],
                [102, 3],
                [102, 4],
                [bad, 3],
              ],
            ]),
          ])
        ),
      /WGS84/
    );
  }
  assert.throws(
    () =>
      exportBoundary(
        estate([
          feature("A", [
            [
              [1, 2],
              [1, 2],
              [1, 2],
            ],
          ]),
        ])
      ),
    /distinct/
  );
});
