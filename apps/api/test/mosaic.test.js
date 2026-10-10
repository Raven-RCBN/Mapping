import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import express from "express";
import request from "supertest";
import { readMosaicTile, installMosaic } from "../src/service/mosaic.js";
let root, mosaic;
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "mosaic-test-"));
  const index = Buffer.alloc(16);
  const chunks = [index]; let offset = 16;
  for (const color of ["red", "blue"]) {
    const raw = await sharp({ create: { width: 2, height: 2, channels: 3, background: color } }).webp({ lossless: true }).toBuffer();
    const prefix = [3]; let n = raw.length;
    do { prefix.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n);
    index.writeUIntLE(offset, (chunks.length - 1) * 8, 6);
    index[(chunks.length - 1) * 8 + 7] = 3;
    chunks.push(Buffer.concat([Buffer.from(prefix), raw])); offset += prefix.length + raw.length;
  }
  await fs.writeFile(path.join(root, "tiles.cmf2"), Buffer.concat(chunks));
  mosaic = { path: "tiles.cmf2", dataOffset: 0, sha256: "a".repeat(64), levels: [{ cols: 1, rows: 2, indexOffset: 0 }] };
});
after(async () => fs.rm(root, { recursive: true, force: true }));
test("north-up tile addressing and invalid coordinates", async () => {
  const tile = await readMosaicTile(root, mosaic, 0, 0, 0);
  const pixels = await sharp(tile).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 3)], [0, 0, 255]);
  for (const coords of [[-1,0,0],[0,-1,0],[0,0,2],[1,0,0],[0,0,0.5]])
    assert.equal(await readMosaicTile(root, mosaic, ...coords), null);
  await assert.rejects(readMosaicTile(root, {...mosaic,path:"../outside"},0,0,0));
  await assert.rejects(readMosaicTile(root, {...mosaic,dataOffset:999999},0,0,0));
});
test("tile endpoint enforces estate access, retirement and private caching", async () => {
  let access = false;
  const asset = { estateId: "oban", kind: "reference-image", mosaic };
  const app = express();
  installMosaic(app, { Asset: { findById: () => ({ lean: async () => asset }) } }, { dataDir: root }, () => access);
  const url = "/assets/oban-mosaic/tiles/0/0/0";
  assert.equal((await request(app).get(url)).status, 403);
  access = true;
  const response = await request(app).get(url);
  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /image\/png/);
  assert.equal(response.headers["cache-control"], "private, no-cache");
  assert.equal((await request(app).get(url).set("If-None-Match", response.headers.etag)).status, 304);
  assert.equal((await request(app).get("/assets/oban-mosaic/tiles/0/0/99")).status, 404);
  assert.equal((await request(app).get("/assets/oban-mosaic/tiles/-1/0/0")).status, 400);
  asset.storageState = "retired";
  assert.equal((await request(app).get(url)).status, 410);
});
