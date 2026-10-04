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

test("map selection is shared by map, timeline and popup pages; catalog remains scoped and paged", async () => {
  // An isolated selection estate keeps the existing scale fixtures untouched.
  await models.Estate.create({ _id: "selection", name: "Selection" });
  const selectionApp = await createApp({
    models,
    dataDir: root,
    origins: [],
    serveWeb: false,
    authenticate: (req, res, next) => {
      req.access = {
        subject: "selection-viewer",
        role: "viewer",
        estateIds: ["selection"],
      };
      next();
    },
  });
  await models.FieldActivity.insertMany(
    Array.from({ length: 57 }, (_, i) => ({
      _id: "selection-" + i,
      estateId: "selection",
      blockCode: "S",
      workDate: "2026-01-01",
      activityDescription:
        i === 0
          ? "Spraying"
          : i === 1
          ? "Weeding"
          : "Other " + String(i).padStart(2, "0"),
      mandays: 2,
    }))
  );
  await models.HarvestingActivity.create({
    _id: "selection-h",
    estateId: "selection",
    blockCode: "S",
    workDate: "2026-01-01",
    bunches: 5,
  });
  const read = (path, mapVisibility, extra = {}) =>
    request(selectionApp)
      .post("/api" + path)
      .set("X-Mapping-Client", "1")
      .send({ estates: "selection", mapVisibility, ...extra });
  const selected = {
    mode: "include",
    fields: ["Spraying", "Weeding"],
    harvesting: false,
  };
  const dashboard = await read("/dashboard", selected);
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(dashboard.body.summary.count, 2);
  assert.equal(dashboard.body.summary.mandays, 4);
  assert.ok(dashboard.body.rows.every((x) => x.recordKind === "field"));
  const timeline = await read("/timeline", selected, {
    anchor: "2026-01-01",
    period: "day",
  });
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
  assert.equal(timeline.body.days[0].count, 2);
  const popup = await read("/records/field", selected, {
    block: "selection::S",
    limit: 1,
  });
  assert.equal(popup.body.summary.count, 2);
  assert.equal(popup.body.items.length, 1);
  const next = await read("/records/field", selected, {
    block: "selection::S",
    limit: 1,
    cursor: popup.body.nextCursor,
  });
  assert.deepEqual(
    new Set(
      [...popup.body.items, ...next.body.items].map(
        (x) => x.activityDescription
      )
    ),
    new Set(selected.fields)
  );
  assert.equal(
    (
      await read("/dashboard", {
        mode: "include",
        fields: [],
        harvesting: false,
      })
    ).body.summary.count,
    0
  );
  assert.equal(
    (
      await read("/dashboard", {
        mode: "exclude",
        fields: [],
        harvesting: true,
      })
    ).body.summary.count,
    58
  );
  assert.equal(
    (
      await read("/dashboard", {
        mode: "exclude",
        fields: ["Spraying", "Weeding"],
        harvesting: true,
      })
    ).body.summary.count,
    56
  );
  assert.equal(
    (await read("/dashboard", selected, { estates: "a" })).status,
    403
  );
  assert.equal(
    (await read("/dashboard", { ...selected, fields: [{ $ne: null }] })).status,
    400
  );
  assert.equal(
    (
      await read("/dashboard", {
        ...selected,
        fields: Array(501).fill("Spraying"),
      })
    ).status,
    400
  );
  const first = (await request(selectionApp).get("/api/activity-options")).body;
  assert.equal(first.items.length, 50);
  assert.equal(first.total, 57);
  const last = (
    await request(selectionApp)
      .get("/api/activity-options")
      .query({ after: first.next })
  ).body;
  assert.equal(new Set([...first.items, ...last.items]).size, 57);
  assert.equal(last.next, null);
  const search = (
    await request(selectionApp).get("/api/activity-options?q=pray")
  ).body;
  assert.deepEqual(search.items, ["Spraying"]);
  assert.equal(
    (await request(selectionApp).get("/api/activity-options?estates=a")).status,
    403
  );
  // Data menu requests have no map selection and still see all records.
  assert.equal(
    (await request(selectionApp).get("/api/records/field")).body.summary.count,
    57
  );
});

test("cards preserve verified denominator in review mode and refresh correctly after verification", async () => {
  await models.Estate.create({ _id: "cards", name: "Cards" });
  await models.HarvestingActivity.insertMany([
    {
      _id: "cards-h1",
      estateId: "cards",
      blockCode: "C1",
      workDate: "2025-12-12",
      bunches: 10,
      status: "verified",
    },
    {
      _id: "cards-h2",
      estateId: "cards",
      blockCode: "C2",
      workDate: "2025-12-13",
      bunches: 15,
      status: "recorded",
    },
  ]);
  await models.FieldActivity.insertMany([
    {
      _id: "cards-f1",
      estateId: "cards",
      blockCode: "C1",
      workDate: "2025-12-12",
      activityDescription: "Spraying",
      mandays: 1.5,
      status: "verified",
    },
    {
      _id: "cards-f2",
      estateId: "cards",
      blockCode: "C1",
      workDate: "2025-12-12",
      activityDescription: "Weeding",
      mandays: 2.25,
      status: "recorded",
    },
  ]);
  const read = async (extra) =>
    (
      await request(app)
        .post("/api/dashboard")
        .set("X-Mapping-Client", "1")
        .send({ estates: "cards", ...extra })
        .expect(200)
    ).body;
  const total = {
    count: 4,
    verified: 2,
    pending: 2,
    bunches: 25,
    mandays: 3.75,
  };
  assert.deepEqual((await read({})).selectionSummary, total);
  const review = await read({ review: "true" });
  assert.deepEqual(review.selectionSummary, total);
  assert.deepEqual(review.summary, {
    count: 2,
    verified: 0,
    pending: 2,
    bunches: 15,
    mandays: 2.25,
  });
  assert.deepEqual(
    (await read({ from: "2025-12-12", to: "2025-12-13" })).selectionSummary,
    { count: 3, verified: 2, pending: 1, bunches: 10, mandays: 3.75 }
  );
  assert.equal((await read({ block: "cards::C2" })).selectionSummary.count, 1);
  assert.equal(
    (await read({ from: "2027-01-01", to: "2027-01-02" })).selectionSummary
      .count,
    0
  );
  assert.equal(
    (
      await read({
        mapVisibility: { mode: "include", fields: [], harvesting: false },
      })
    ).selectionSummary.count,
    0
  );
  const field = await read({
    mapVisibility: { mode: "include", fields: ["Spraying"], harvesting: false },
  });
  assert.deepEqual(field.selectionSummary, {
    count: 1,
    verified: 1,
    pending: 0,
    bunches: 0,
    mandays: 1.5,
  });
  await request(app)
    .patch("/api/harvesting/cards-h2/verify")
    .set("X-Mapping-Client", "1")
    .expect(200);
  const after = await read({ review: "true" });
  assert.deepEqual(after.selectionSummary, {
    ...total,
    verified: 3,
    pending: 1,
  });
  assert.deepEqual(after.summary, {
    count: 1,
    verified: 0,
    pending: 1,
    bunches: 0,
    mandays: 2.25,
  });
});

test("compact map popups return only activity and mandays, with filtered totals and bounded pages", async () => {
  const read = async (extra = {}, target = app) =>
    request(target)
      .post("/api/map-popup")
      .set("X-Mapping-Client", "1")
      .send({ estates: "cards", block: "cards::C1", gps: "block", ...extra });
  const first = await read({ limit: 1 });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.items, [{ activity: "Spraying", mandays: 1.5 }]);
  const second = await read({ limit: 1, cursor: first.body.nextCursor });
  assert.deepEqual(second.body.items, [{ activity: "Weeding", mandays: 2.25 }]);
  const third = await read({ limit: 1, cursor: second.body.nextCursor });
  assert.deepEqual(third.body.items, [
    { activity: "Harvesting", mandays: null },
  ]);
  assert.equal(third.body.nextCursor, null);
  assert.equal(
    (await read({ limit: 1, cursor: first.body.nextCursor, review: "true" }))
      .status,
    400
  );
  const only = await read({
    mapVisibility: { mode: "include", fields: ["Weeding"], harvesting: false },
  });
  assert.deepEqual(only.body.items, [{ activity: "Weeding", mandays: 2.25 }]);
  const noMatch = await read({ from: "2027-01-01", to: "2027-01-02" });
  assert.deepEqual(noMatch.body.items, []);
  assert.equal((await read({}, scoped)).status, 403);
  assert.equal((await read({ block: "all" })).status, 400);
  // Distinct GPS locations must not be merged into the block-position bubble.
  await models.FieldActivity.create({
    _id: "popup-gps",
    estateId: "cards",
    blockCode: "C1",
    workDate: "2025-12-12",
    activityDescription: "Spraying",
    mandays: 100,
    geolocation: { type: "Point", coordinates: [101, 3] },
  });
  const gps = await read({ gps: "101,3" });
  assert.deepEqual(gps.body.items, [{ activity: "Spraying", mandays: 100 }]);
  assert.deepEqual((await read({ review: "true" })).body.items, [
    { activity: "Weeding", mandays: 2.25 },
  ]);
});
