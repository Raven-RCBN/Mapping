import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createModels } from "../src/model/index.js";
import { createApp } from "../src/app.js";
import { SummaryCache } from "../src/service/performance.js";

let models,
  app,
  root,
  scoped,
  viewer,
  clock = new Date("2026-10-04");
before(async () => {
  await mongoose.connect(
    `mongodb://127.0.0.1:27018/MappingTest_scaling_${Date.now()}`
  );
  models = createModels(mongoose, "Scale");
  root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-scale-"));
  const config = {
    models,
    dataDir: root,
    origins: [],
    authMode: "development",
    clock: () => clock,
    serveWeb: false,
  };
  app = await createApp(config);
  const authenticate = (req, res, next) => {
    req.access = { subject: "viewer", role: "viewer", estateIds: ["a"] };
    next();
  };
  scoped = await createApp({ ...config, authenticate });
  viewer = scoped;
  await models.Estate.create([
    { _id: "a", name: "A", workbookImportId: "import" },
    { _id: "b", name: "B" },
  ]);
  await models.Block.create([
    { _id: "block-a", estateId: "a", blockCode: "A" },
    { _id: "block-b", estateId: "b", blockCode: "B" },
  ]);
  await models.HarvestingActivity.insertMany(
    Array.from({ length: 1205 }, (_, i) => ({
      _id: "h-" + String(i).padStart(5, "0"),
      estateId: i < 1200 ? "a" : "b",
      blockId: i < 1200 ? "block-a" : "block-b",
      blockCode: i < 1200 ? "A" : "B",
      workDate: "2025-12-12",
      employeeName: "Worker " + i,
      employeeNo: "W" + i,
      gang: "Team",
      bunches: 10,
      status: i % 2 ? "verified" : "recorded",
    }))
  );
  await models.FieldActivity.insertMany(
    Array.from({ length: 70 }, (_, i) => ({
      _id: "f-" + String(i).padStart(5, "0"),
      estateId: "a",
      blockId: "block-a",
      blockCode: "A",
      workDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      gang: "Spray",
      activityCode: "W1",
      activityDescription: "Weeding",
      mandays: 2,
    }))
  );
});
after(async () => {
  if (mongoose.connection.name?.startsWith("MappingTest_"))
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await fs.rm(root, { recursive: true, force: true });
});
test("keyset pages are stable across equal dates and enforce estate scope and bounded limits", async () => {
  let cursor,
    ids = [];
  do {
    const r = await request(scoped)
      .get("/api/records/harvesting")
      .query({ limit: 100, ...(cursor ? { cursor } : {}) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.summary.count, 1200);
    assert.ok(r.body.items.length <= 100);
    assert.ok(r.body.items.every((x) => x.estateId === "a"));
    ids.push(...r.body.items.map((x) => x.id));
    cursor = r.body.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 1200);
  assert.equal(new Set(ids).size, 1200);
  const first = (await request(scoped).get("/api/records/harvesting?limit=25"))
    .body;
  assert.equal(
    (
      await request(scoped)
        .get("/api/records/harvesting")
        .query({ cursor: first.nextCursor, q: "different" })
    ).status,
    400
  );
  assert.equal(
    (await request(scoped).get("/api/records/harvesting?estates=b")).status,
    403
  );
  assert.equal(
    (await request(scoped).get("/api/records/harvesting?limit=10000")).status,
    400
  );
  assert.equal(
    (await request(scoped).get("/api/records/harvesting?q=%5B.*")).body.summary
      .count,
    0
  );
});
test("bootstrap omits records; server map summaries and timeline counts include all records", async () => {
  const bootstrap = await request(scoped).get("/api/bootstrap");
  assert.equal(bootstrap.body.paged, true);
  assert.equal(bootstrap.body.activities.length, 0);
  assert.equal(bootstrap.body.latest, "2026-03-11");
  const r = await request(scoped).get(
    "/api/dashboard?from=2025-12-12&to=2025-12-13"
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rows.length, 1);
  assert.equal(r.body.rows[0].count, 1200);
  assert.equal(r.body.summary.count, 1200);
  assert.equal(r.body.summary.bunches, 12000);
  assert.equal(r.body.summary.verified, 600);
  assert.equal("employeeName" in r.body.rows[0], false);
  const page1 = await request(scoped).get(
    "/api/timeline?anchor=2026-03-11&period=month"
  );
  assert.equal(page1.status, 200, JSON.stringify(page1.body));
  assert.equal(page1.body.days.length, 40);
  const page2 = await request(scoped).get("/api/timeline").query({
    anchor: "2026-03-11",
    period: "month",
    before: page1.body.nextBefore,
  });
  const dates = [...page1.body.days, ...page2.body.days].map((x) => x.date);
  assert.equal(new Set(dates).size, 71);
  assert.equal(
    page1.body.series
      .find((x) => x.kind === "field")
      .windows.reduce((n, x) => n + x.count, 0),
    70
  );
});
test("summary cache is bounded, isolated by estate access, and invalidated after a write", async () => {
  const cache = new SummaryCache({ maxEntries: 2, maxBytes: 100 });
  cache.set("one", { n: 1 });
  cache.set("two", { n: 2 });
  cache.set("three", { n: 3 });
  assert.equal(cache.get("one"), null);
  assert.equal(cache.entries.size, 2);
  const url = "/api/dashboard?from=2025-12-12&to=2025-12-13";
  assert.equal((await request(app).get(url)).body.summary.count, 1205);
  assert.equal((await request(scoped).get(url)).body.summary.count, 1200);
  const before = (await request(app).get(url)).body.summary.verified;
  await request(app)
    .patch("/api/harvesting/h-00000/verify")
    .set("X-Mapping-Client", "1")
    .expect(200);
  assert.equal((await request(app).get(url)).body.summary.verified, before + 1);
});
test("common record queries use compound indexes without a collection scan or blocking sort", async () => {
  const plan = await models.HarvestingActivity.find({
    estateId: "a",
    blockCode: "A",
    workDate: { $gte: "2025-01-01" },
  })
    .sort({ workDate: -1, _id: -1 })
    .limit(26)
    .explain("executionStats");
  const text = JSON.stringify(plan.queryPlanner.winningPlan);
  assert.match(text, /IXSCAN/);
  assert.doesNotMatch(text, /COLLSCAN|"stage":"SORT"/);
  assert.ok(plan.executionStats.totalDocsExamined <= 26);
});
test("large JSON is compressed, personnel data is not browser cached, offline scope is applied before export", async () => {
  const r = await request(scoped)
    .get("/api/records/harvesting?limit=100")
    .set("Accept-Encoding", "gzip");
  assert.equal(r.headers["content-encoding"], "gzip");
  assert.equal(r.headers["cache-control"], "no-store");
  const pack = await request(app).get(
    "/api/offline?estates=a&from=2026-01-01&to=2026-01-03"
  );
  assert.equal(pack.status, 200, JSON.stringify(pack.body));
  assert.equal(pack.body.snapshot.activities.length, 2);
  assert.ok(pack.body.snapshot.estates.every((x) => x.id === "a"));
});
async function fixture(id, date, extra = {}) {
  const relative = `estates/a/images/${id}.png`,
    full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  await fs.writeFile(full, bytes);
  return models.Asset.create({
    _id: id,
    estateId: "a",
    kind: "imagery",
    name: id,
    acquiredAt: date,
    file: {
      path: relative,
      mime: "image/png",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    ...extra,
  });
}
const post = (target, url, body) =>
  request(target)
    .post("/api" + url)
    .set("X-Mapping-Client", "1")
    .send(body);
test("image revalidation requires authorization; symlink escape and retired files cannot be served", async () => {
  await fixture("old1", "2024-01-01");
  await fixture("old2", "2024-02-01");
  await fixture("latest", "2026-10-01");
  const r = await request(scoped).get("/api/assets/old1/file");
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "private, no-cache");
  assert.equal(
    (
      await request(scoped)
        .get("/api/assets/old1/file")
        .set("If-None-Match", r.headers.etag)
    ).status,
    304
  );
  const thumb = await request(scoped).get("/api/assets/old1/thumbnail");
  assert.equal(thumb.status, 200);
  assert.match(thumb.headers["content-type"], /image\/webp/);
  const link = await fixture("link", "2024-03-01");
  await fs.unlink(path.join(root, link.file.path));
  await fs.symlink("/etc/hosts", path.join(root, link.file.path));
  assert.equal(
    (await request(scoped).get("/api/assets/link/file")).status,
    400
  );
  await models.Asset.deleteOne({ _id: "link" });
  await fs.unlink(path.join(root, link.file.path));
});
test("retirement is administrator-only, protects latest images, supports restore, and purge requires grace and explicit preview", async () => {
  const body = {
    estateId: "a",
    before: "2027-01-01",
    keep: 1,
    action: "retire",
  };
  assert.equal((await post(viewer, "/storage/preview", body)).status, 403);
  const first = (await post(app, "/storage/preview", body)).body;
  assert.deepEqual(
    first.files.map((x) => x.id),
    ["old1", "old2"]
  );
  assert.equal((await models.Asset.findById("old1")).storageState, "active");
  assert.equal(
    (
      await post(app, "/storage/apply", {
        token: first.token,
        confirmation: "PURGE",
      })
    ).status,
    409
  );
  const applied = await post(app, "/storage/apply", {
    token: first.token,
    confirmation: "RETIRE",
  });
  assert.equal(applied.body.completed.length, 2);
  assert.equal((await request(app).get("/api/assets/old1/file")).status, 410);
  assert.equal(
    (await post(app, "/storage/preview", { ...body, action: "purge" })).body
      .files.length,
    0
  );
  assert.equal((await post(app, "/storage/old1/restore", {})).status, 200);
  assert.equal((await request(app).get("/api/assets/old1/file")).status, 200);
  clock = new Date("2026-11-05");
  const purge = (
    await post(app, "/storage/preview", { ...body, action: "purge" })
  ).body;
  assert.deepEqual(
    purge.files.map((x) => x.id),
    ["old2"]
  );
  const done = await post(app, "/storage/apply", {
    token: purge.token,
    confirmation: "PURGE",
  });
  assert.deepEqual(done.body.completed, ["old2"]);
  await assert.rejects(fs.access(path.join(root, "estates/a/images/old2.png")));
  assert.equal((await models.Asset.findById("old2")).storageState, "purged");
  assert.ok((await models.Asset.findById("old2")).purgedBy);
  assert.equal((await request(app).get("/api/assets/latest/file")).status, 200);
  assert.equal(
    (
      await post(app, "/storage/apply", {
        token: purge.token,
        confirmation: "PURGE",
      })
    ).status,
    409
  );
});
test("oversize offline packs fail explicitly and asset windows retain nearest earlier imagery", async () => {
  const r = await request(app).get(
    "/api/offline?estates=a&from=2025-01-01&to=2026-01-01"
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(
    r.body.snapshot.assets.map((x) => x.id),
    ["old1"]
  );
  await models.Asset.updateOne(
    { _id: "latest" },
    { $set: { "file.bytes": 600 * 1024 * 1024 } }
  );
  const big = await request(app).get("/api/offline?estates=a");
  assert.equal(big.status, 413);
  assert.match(big.body.error, /shorter date range/);
});

test("retired-image recovery list uses stable bounded pages", async () => {
  await models.Asset.insertMany(
    Array.from({ length: 103 }, (_, i) => ({
      _id: "retired-" + String(i).padStart(4, "0"),
      estateId: "a",
      kind: "imagery",
      acquiredAt: "2024-01-01",
      storageState: "retired",
      retiredAt: new Date("2026-10-01"),
      file: { bytes: 10, path: "estates/a/images/unneeded-" + i },
    }))
  );
  const first = (await request(app).get("/api/storage?estates=a")).body;
  assert.equal(first.retired.length, 100);
  assert.ok(first.nextCursor);
  const second = (
    await request(app)
      .get("/api/storage")
      .query({ estates: "a", cursor: first.nextCursor })
  ).body;
  assert.equal(second.retired.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.retired, ...second.retired].map((x) => x.id)).size,
    103
  );
  assert.equal(
    (
      await request(app)
        .get("/api/storage")
        .query({ estates: "b", cursor: first.nextCursor })
    ).status,
    400
  );
});
