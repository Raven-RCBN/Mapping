import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import sharp from "sharp";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { Estate, Asset, AccessGrant } from "../src/model/index.js";
import { resolveStoredFile } from "../src/service/files.js";
let root, config, app, image, asset, privateKey;
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "mapping-test-"));
  await mongoose.connect(
    process.env.MONGODB_TEST_URI ||
      `mongodb://127.0.0.1:27018/MappingTest_${Date.now()}`
  );
  assert.match(mongoose.connection.name, /^MappingTest_/);
  config = { dataDir: root, origins: [], authMode: "development" };
  app = await createApp(config);
  await Estate.create([
    { _id: "estate-a", name: "A" },
    { _id: "estate-b", name: "B" },
  ]);
  image = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#23543d" },
  })
    .png()
    .toBuffer();
});
after(async () => {
  if (mongoose.connection.name?.startsWith("MappingTest_"))
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (root) await fs.rm(root, { recursive: true, force: true });
});
function upload(target = app, b = "[[3,101],[4,102]]") {
  return request(target)
    .post("/api/estates/estate-a/images")
    .set("X-Mapping-Client", "1")
    .field("name", "Uploaded estate photo")
    .field("acquiredAt", "2026-10-01")
    .field("bounds", b)
    .attach("file", image, "field.png");
}
test("uploaded image is stored in an estate folder and survives a fresh app instance", async () => {
  const r = await upload();
  assert.equal(r.status, 201, JSON.stringify(r.body));
  asset = r.body;
  const doc = await Asset.findById(asset.id).lean();
  assert.match(doc.file.path, /^estates\/estate-a\/images\/.+\.png$/);
  assert.equal(doc.file.bytes, image.length);
  assert.equal("blob" in doc, false);
  const bytes = await fs.readFile(resolveStoredFile(root, doc.file.path));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  const reopened = await createApp(config),
    snap = await request(reopened).get("/api/snapshot");
  assert.equal(snap.body.assets[0].id, asset.id);
  const file = await request(reopened).get(asset.url);
  assert.equal(file.status, 200);
  assert.equal(
    createHash("sha256").update(file.body).digest("hex"),
    asset.sha256
  );
});
test("offline manifest includes the persistent upload and its checksum", async () => {
  const r = await request(app).get("/api/offline?estates=estate-a");
  assert.equal(r.status, 200);
  assert.equal(r.body.files[0].id, asset.id);
  assert.equal(r.body.files[0].sha256, asset.sha256);
  assert.equal(r.body.snapshot.assets[0].acquiredAt, "2026-10-01");
});
test("invalid bounds do not leave uploaded temporary files", async () => {
  const r = await upload(app, "[[4,102],[3,101]]");
  assert.equal(r.status, 400);
  assert.deepEqual(await fs.readdir(path.join(root, ".staging")), []);
  assert.equal(await Asset.countDocuments(), 1);
});
test("unknown API paths return JSON 404; disk traversal is rejected", async () => {
  const r = await request(app).get("/api/not-a-route");
  assert.equal(r.status, 404);
  assert.throws(() => resolveStoredFile(root, "../outside"));
  assert.throws(() => resolveStoredFile(root, "/etc/passwd"));
});
test("JWT access is estate scoped, with read-only viewers and no unsigned bypass", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = keys.privateKey;
  const keyPath = path.join(root, "test-public.pem");
  await fs.writeFile(
    keyPath,
    keys.publicKey.export({ type: "spki", format: "pem" })
  );
  await AccessGrant.create({
    _id: "viewer",
    active: true,
    role: "viewer",
    estateIds: ["estate-b"],
  });
  const secured = await createApp({
    ...config,
    authMode: "jwt",
    publicKeyPath: keyPath,
    issuer: "test",
    audience: "mapping",
  });
  const token = jwt.sign({ sub: "viewer" }, privateKey, {
    algorithm: "RS256",
    issuer: "test",
    audience: "mapping",
    expiresIn: "5m",
  });
  const headers = { Authorization: "Bearer " + token, "X-Mapping-Client": "1" };
  assert.equal((await request(secured).get("/api/snapshot")).status, 401);
  const snap = await request(secured).get("/api/snapshot").set(headers);
  assert.deepEqual(
    snap.body.estates.map((x) => x.id),
    ["estate-b"]
  );
  assert.equal(snap.body.assets.length, 0);
  assert.equal(
    (await request(secured).get(asset.url).set(headers)).status,
    403
  );
  assert.equal(
    (await request(secured).get("/api/offline?estates=estate-a").set(headers))
      .status,
    400
  );
  assert.equal(
    (
      await request(secured)
        .post("/api/estates")
        .set(headers)
        .send({ name: "blocked" })
    ).status,
    403
  );
});

test("invalid image bytes are rejected without residual files", async () => {
  const r = await request(app)
    .post("/api/estates/estate-a/images")
    .set("X-Mapping-Client", "1")
    .field("name", "Bad image")
    .field("acquiredAt", "2026-10-01")
    .field("bounds", "[[3,101],[4,102]]")
    .attach("file", Buffer.from("not an image"), "bad.png");
  assert.equal(r.status, 400);
  assert.deepEqual(await fs.readdir(path.join(root, ".staging")), []);
  assert.equal(await Asset.countDocuments(), 1);
});
