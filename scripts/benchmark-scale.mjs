// Synthetic, local-only benchmark. Never connects to the application database.
import mongoose from "../apps/api/node_modules/mongoose/index.js";
import request from "../apps/api/node_modules/supertest/index.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createApp } from "../apps/api/src/app.js";
import { createModels } from "../apps/api/src/model/index.js";
const database = "MappingTest_benchmark_" + Date.now();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-benchmark-"));
try {
  await mongoose.connect("mongodb://127.0.0.1:27018/" + database);
  const models = createModels(mongoose, "Benchmark");
  const app = await createApp({
    models,
    dataDir: root,
    origins: [],
    authMode: "development",
    serveWeb: false,
  });
  await models.Estate.create({
    _id: "synthetic",
    name: "Synthetic benchmark",
    workbookImportId: "synthetic",
  });
  for (const [kind, model] of [
    ["harvesting", models.HarvestingActivity],
    ["field", models.FieldActivity],
  ]) {
    for (let batch = 0; batch < 10; batch++) {
      await model.insertMany(
        Array.from({ length: 5000 }, (_, j) => {
          const i = batch * 5000 + j;
          return {
            _id: kind + "-" + String(i).padStart(6, "0"),
            estateId: "synthetic",
            blockId: "block-" + (i % 100),
            blockCode: "B" + (i % 100),
            workDate: new Date(Date.UTC(2024, 0, 1 + (i % 730)))
              .toISOString()
              .slice(0, 10),
            gang: "Synthetic gang",
            employeeName: "Synthetic worker",
            activityCode: "TEST",
            activityDescription: "Synthetic field work",
            bunches: 10,
            mandays: 2,
          };
        }),
        { ordered: false }
      );
    }
  }
  const measurements = [];
  for (const [name, endpoint] of [
    ["bootstrap", "/bootstrap"],
    ["record page", "/records/harvesting?estates=synthetic&limit=25"],
    ["map all-history summary", "/dashboard?estates=synthetic"],
    ["map cached summary", "/dashboard?estates=synthetic"],
    [
      "timeline 7 months",
      "/timeline?estates=synthetic&anchor=2025-12-01&period=month",
    ],
  ]) {
    const start = performance.now(),
      r = await request(app).get("/api" + endpoint);
    if (r.status !== 200) throw Error(name + ": " + JSON.stringify(r.body));
    measurements.push({
      name,
      milliseconds: Math.round(performance.now() - start),
      jsonBytes: Buffer.byteLength(JSON.stringify(r.body)),
      records:
        r.body.summary?.count ??
        r.body.items?.length ??
        r.body.activities?.length,
    });
  }
  const plan = await models.HarvestingActivity.find({
    estateId: "synthetic",
    blockCode: "B1",
    workDate: { $gte: "2025-01-01" },
  })
    .sort({ workDate: -1, _id: -1 })
    .limit(26)
    .explain("executionStats");
  console.log(
    JSON.stringify(
      {
        syntheticRecords: 100000,
        measurements,
        indexedPage: {
          returned: plan.executionStats.nReturned,
          documentsExamined: plan.executionStats.totalDocsExamined,
          keysExamined: plan.executionStats.totalKeysExamined,
        },
      },
      null,
      2
    )
  );
} finally {
  if (mongoose.connection.name === database)
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await fs.rm(root, { recursive: true, force: true });
}
