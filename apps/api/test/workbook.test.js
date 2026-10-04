import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createModels } from "../src/model/index.js";
import { importWorkbook } from "../src/service/workbook.js";
import { createApp } from "../src/app.js";
let models, app, root;
const importId = "a".repeat(64);
const provenance = {
  estateId: "estate-a",
  importId,
  sourceFile: "test.xlsx",
  sourceRow: 7,
};
const payload = {
  version: 1,
  estateId: "estate-a",
  importId,
  removed: [{ reason: "missing block" }, { reason: "exact duplicate" }],
  blocks: [
    {
      ...provenance,
      _id: "block-a",
      blockCode: "OP2006",
      plantedHectares: 31.7,
    },
    { ...provenance, _id: "block-b", blockCode: "OP2016", sourceRow: 8 },
  ],
  harvesting: [
    {
      ...provenance,
      _id: "harvest-a",
      blockCode: "OP2006",
      workDate: "2025-12-12",
      bunches: 20,
      employeeNo: "test",
      geolocation: null,
    },
  ],
  fieldActivities: [
    {
      ...provenance,
      _id: "field-a",
      blockCode: "OP2016",
      workDate: "2026-09-30",
      mandays: 4,
      activityDescription: "Spraying",
      geolocation: null,
    },
  ],
};
before(async () => {
  await mongoose.connect(
    `mongodb://127.0.0.1:27018/MappingTest_workbook_${Date.now()}`
  );
  models = createModels(mongoose, "WorkbookTest");
  await models.Estate.create({
    _id: "estate-a",
    name: "Test",
    boundary: {
      features: [
        { properties: { blockName: "OP_2006" } },
        { properties: { blockName: "OP_2016A" } },
        { properties: { blockName: "OP_2016B" } },
      ],
    },
  });
  await models.Activity.create({
    _id: "legacy",
    estateId: "estate-a",
    type: "Harvesting",
  });
  root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-workbook-"));
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
test("separate collections, conservative block matching, idempotency and null GPS", async () => {
  const counts = await importWorkbook(models, payload);
  assert.deepEqual(counts, {
    blocks: 2,
    harvesting: 1,
    fieldActivities: 1,
    matchedBlocks: 1,
    removedRows: 2,
  });
  await importWorkbook(models, payload);
  assert.equal(await models.HarvestingActivity.countDocuments(), 1);
  assert.equal(await models.FieldActivity.countDocuments(), 1);
  assert.deepEqual(
    (await models.Block.findById("block-a")).mapBlockNames.toObject(),
    ["OP_2006"]
  );
  assert.deepEqual(
    (await models.Block.findById("block-b")).mapBlockNames.toObject(),
    []
  );
  assert.equal(
    (await models.HarvestingActivity.findById("harvest-a")).geolocation,
    null
  );
  const snap = (await request(app).get("/api/snapshot")).body;
  assert.equal(snap.blocks.length, 2);
  assert.equal(snap.activities.length, 2);
  assert.deepEqual(
    new Set(snap.activities.map((r) => r.recordKind)),
    new Set(["harvesting", "field"])
  );
  assert.equal(
    snap.activities.find((r) => r.recordKind === "harvesting").unit,
    "bunches"
  );
  const pack = (await request(app).get("/api/offline?estates=estate-a")).body;
  assert.equal(pack.snapshot.blocks.length, 2);
  assert.equal(pack.snapshot.activities.length, 2);
});
test("geolocation validation, future GPS ingestion and preserved edits on reimport", async () => {
  const send = (url, data) =>
    request(app).patch(url).set("X-Mapping-Client", "1").send(data);
  assert.equal(
    (
      await send("/api/harvesting/harvest-a/geolocation", {
        geolocation: { type: "Point", coordinates: [181, 3] },
      })
    ).status,
    400
  );
  assert.equal(
    (
      await send("/api/harvesting/harvest-a/geolocation", {
        geolocation: { type: "Point", coordinates: [101.54, 3.62] },
      })
    ).status,
    200
  );
  await importWorkbook(models, payload);
  assert.deepEqual(
    (
      await models.HarvestingActivity.findById("harvest-a")
    ).geolocation.coordinates.toObject(),
    [101.54, 3.62]
  );
  const future = await request(app)
    .post("/api/field-activities")
    .set("X-Mapping-Client", "1")
    .send({
      estateId: "estate-a",
      blockId: "block-a",
      workDate: "2026-10-04",
      gang: "A",
      activityCode: "W1",
      activityDescription: "Weeding",
      mandays: 2,
      geolocation: { type: "Point", coordinates: [101.55, 3.63] },
    });
  assert.equal(future.status, 201);
  assert.equal(future.body.block, "OP2006");
  assert.equal(
    (
      await send("/api/blocks/block-b/map-links", {
        mapBlockNames: ["missing"],
      })
    ).status,
    400
  );
});
test("new table endpoints and GPS writes respect estate and viewer permissions", async () => {
  const scoped = await createApp({
    models,
    dataDir: root,
    origins: [],
    authenticate: (req, res, next) => {
      req.access = { subject: "test", role: "viewer", estateIds: ["estate-b"] };
      next();
    },
  });
  for (const url of ["/blocks", "/harvesting", "/field-activities"])
    assert.equal((await request(scoped).get("/api" + url)).body.length, 0);
  assert.equal(
    (
      await request(scoped)
        .patch("/api/harvesting/harvest-a/geolocation")
        .set("X-Mapping-Client", "1")
        .send({ geolocation: null })
    ).status,
    403
  );
  const manager = await createApp({
    models,
    dataDir: root,
    origins: [],
    authenticate: (req, res, next) => {
      req.access = {
        subject: "test",
        role: "manager",
        estateIds: ["estate-b"],
      };
      next();
    },
  });
  assert.equal(
    (
      await request(manager)
        .patch("/api/field-activities/field-a/geolocation")
        .set("X-Mapping-Client", "1")
        .send({ geolocation: null })
    ).status,
    403
  );
});
