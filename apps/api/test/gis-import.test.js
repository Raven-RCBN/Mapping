import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import request from "supertest";
import { createModels } from "../src/model/index.js";
import { createApp } from "../src/app.js";
import { fileHash } from "../src/service/files.js";
import { importEstateGIS } from "../src/service/gis-import.js";
let models, root, app, payload;
before(async () => {
  await mongoose.connect(
    `mongodb://127.0.0.1:27018/MappingTest_gis_${Date.now()}`
  );
  models = createModels(mongoose, "GIS");
  await models.Estate.create([
    { _id: "estate-a", name: "Oban", totalAreaHa: 5000 },
    { _id: "estate-b", name: "Other" },
  ]);
  root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-gis-"));
  const dir = path.join(root, "estates/estate-a/vectors");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "rivers.geojson");
  await fs.writeFile(
    file,
    JSON.stringify({ type: "FeatureCollection", features: [] })
  );
  payload = {
    version: 1,
    importId: "a".repeat(64),
    estateId: "estate-a",
    estateName: "Oban",
    source: "supplied.geojson",
    boundary: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { blockName: "A1" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [8, 5],
                [8.1, 5],
                [8.1, 5.1],
                [8, 5],
              ],
            ],
          },
        },
      ],
    },
    blocks: [
      {
        _id: "estate-a-block-a1",
        estateId: "estate-a",
        blockCode: "A1",
        plantingYear: "2014",
        mapBlockNames: ["A1"],
      },
    ],
    assets: [
      {
        _id: "estate-a-rivers",
        estateId: "estate-a",
        name: "Rivers",
        kind: "vector",
        layerType: "rivers",
        featureCount: 0,
        file: {
          path: "estates/estate-a/vectors/rivers.geojson",
          mime: "application/json",
          bytes: (await fs.stat(file)).size,
          sha256: await fileHash(file),
        },
      },
    ],
  };
  app = await createApp({
    models,
    dataDir: root,
    origins: [],
    authMode: "development",
  });
});
after(async () => {
  if (mongoose.connection.name?.startsWith("MappingTest_"))
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await fs.rm(root, { recursive: true, force: true });
});
test("missing/corrupt GIS files cause no partial database writes", async () => {
  const bad = structuredClone(payload);
  bad.assets[0].file.sha256 = "b".repeat(64);
  await assert.rejects(importEstateGIS(models, bad, root), /checksum/);
  assert.equal(await models.Block.countDocuments(), 0);
  assert.equal((await models.Estate.findById("estate-a")).boundary, undefined);
});
test("planting blocks link exactly and retries preserve edits and configured area", async () => {
  assert.deepEqual(await importEstateGIS(models, payload, root), {
    blocks: 1,
    assets: 1,
    sources: 0,
  });
  await models.Block.updateOne(
    { _id: "estate-a-block-a1" },
    { $set: { plantingMaterial: "Confirmed material" } }
  );
  await importEstateGIS(models, payload, root);
  assert.equal(await models.Block.countDocuments(), 1);
  assert.equal(
    (await models.Block.findById("estate-a-block-a1")).plantingMaterial,
    "Confirmed material"
  );
  assert.equal((await models.Estate.findById("estate-a")).totalAreaHa, 5000);
  assert.equal(await models.HarvestingActivity.countDocuments(), 0);
  assert.equal(await models.FieldActivity.countDocuments(), 0);
});
test("estate choice scopes workspace, grids, map assets, summaries, storage and offline files", async () => {
  const read = async (url) => {
    const r = await request(app).get("/api" + url);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  assert.equal(
    (await read("/bootstrap")).estates.find((e) => e.id === "estate-a")
      .blockCount,
    1
  );
  for (const estate of ["estate-a", "estate-b"]) {
    const expected = estate === "estate-a" ? 1 : 0;
    const workspace = await read("/workspace?estates=" + estate);
    assert.deepEqual(
      workspace.estates.map((e) => e.id),
      [estate]
    );
    assert.equal(workspace.blocks.length, expected);
    const grid = await read("/records/blocks?estates=" + estate);
    assert.equal(grid.summary.count, expected);
    const assets = await read(
      "/map-assets?estates=" + estate + "&at=2026-10-05"
    );
    assert.equal(assets.length, expected);
    assert.equal((await read("/dashboard?estates=" + estate)).summary.count, 0);
    const storage = await read("/storage?estates=" + estate);
    assert.ok(storage.groups.every((g) => g._id.estate === estate));
    const offline = await read("/offline?estates=" + estate);
    assert.deepEqual(
      offline.snapshot.estates.map((e) => e.id),
      [estate]
    );
    assert.equal(offline.files.length, expected);
    assert.equal(offline.snapshot.blocks.length, expected);
  }
});
test("undated reference mosaics stay estate scoped, available offline, and outside dated imagery", async () => {
  await models.Asset.create({
    _id: "estate-a-mosaic", estateId: "estate-a", name: "Supplied mosaic",
    kind: "reference-image", importedAt: "2026-10-08", bounds: [[5,8],[5.1,8.1]],
    file: payload.assets[0].file,
  });
  const a = await request(app).get("/api/map-assets?estates=estate-a&at=2024-01-01");
  assert.equal(a.status,200);
  assert.equal(a.body.find(x => x.id === "estate-a-mosaic").acquiredAt,undefined);
  const b = await request(app).get("/api/map-assets?estates=estate-b&at=2024-01-01");
  assert.ok(!b.body.some(x => x.id === "estate-a-mosaic"));
  const offline = await request(app).get("/api/offline?estates=estate-a");
  assert.ok(offline.body.files.some(x => x.id === "estate-a-mosaic"));
});
