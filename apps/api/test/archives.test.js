import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createModels } from '../src/model/index.js';
import { createApp } from '../src/app.js';
let app, models, root, viewer, limited;
const post = (server, url, body = {}) => request(server).post('/api' + url).set('X-Mapping-Client', '1').send(body);
const waitFor = async (id, status) => {
  for (let n = 0; n < 300; n++) {
    const row = await models.Archive.findById(id).lean();
    if (row.status === status) return row;
    if (status !== 'failed') assert.notEqual(row.status, 'failed', row.error);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Archive did not reach ${status}`);
};
async function snapshot() {
  const result = await post(app, '/archives', { estateId: 'a' });
  assert.equal(result.status, 202, JSON.stringify(result.body));
  await waitFor(result.body._id, 'ready');
  return result.body._id;
}
async function verify(id) {
  assert.equal((await post(app, `/archives/${id}/verify`)).status, 202);
  return waitFor(id, 'verified');
}
before(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_archives_${Date.now()}`);
  models = createModels(mongoose, 'ArchiveTest');
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mapping-archives-'));
  const config = { models, dataDir: root, origins: [], authMode: 'development', serveWeb: false };
  app = await createApp(config);
  const auth = role => (req, res, next) => { req.access = { subject: role, role, estateIds: ['a'] }; next(); };
  viewer = await createApp({ ...config, authenticate: auth('viewer') });
  limited = await createApp({ ...config, authenticate: auth('admin') });
  await models.Estate.create([{ _id: 'a', name: 'Estate A' }, { _id: 'b', name: 'Estate B' }]);
  await fs.mkdir(path.join(root, 'estates/a/images'), { recursive: true });
  const bytes = Buffer.from('image fixture');
  const file = { path: 'estates/a/images/old.png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mime: 'image/png' };
  await fs.writeFile(path.join(root, file.path), bytes);
  await models.Asset.create({ _id: 'old', name: 'Old map', estateId: 'a', kind: 'imagery', acquiredAt: '2024-01-01', file, storageState: 'retired', retiredAt: new Date('2024-02-01') });
  await models.Activity.create([{ _id: 'activity-a', estateId: 'a', date: '2024-01-01', note: 'keep history' }, { _id: 'activity-b', estateId: 'b', note: 'private estate B' }]);
  await fs.mkdir(path.join(root, 'estates/a/qgis'));
  await fs.writeFile(path.join(root, 'estates/a/qgis/sidecar.dem'), 'terrain dependency');
});
after(async () => {
  if (mongoose.connection.name?.startsWith('MappingTest_')) await mongoose.connection.dropDatabase();
  await mongoose.disconnect(); await fs.rm(root, { recursive: true, force: true });
});
test('estate snapshots include dependencies and records, enforce roles and verify before purge/recovery', async () => {
  assert.equal((await post(viewer, '/archives', { estateId: 'a' })).status, 403);
  assert.equal((await post(limited, '/archives', { estateId: 'b' })).status, 403);
  assert.equal((await post(app, '/archives', { estateId: '../b' })).status, 400);
  const id = await snapshot();
  assert.equal((await post(app, `/archives/${id}/download`)).status, 409);
  const m = (await request(app).get(`/api/archives/${id}/manifest`)).body;
  assert.ok(m.entries.some(e => e.path === 'files/estates/a/qgis/sidecar.dem'));
  const records = await fs.readFile(path.join(root, 'archives', id, 'records/Activity.jsonl'), 'utf8');
  assert.match(records, /keep history/); assert.doesNotMatch(records, /private estate B/);
  assert.ok(m.entries.every(e => !/AccessGrant|Session|User/.test(e.path)));
  await verify(id);
  assert.equal((await models.Asset.findById('old')).archiveId, id);
  const summary = (await request(viewer).get('/api/archives')).body;
  assert.ok(summary.groups.every(g => g._id.estate === 'a'));
  assert.equal(summary.verifiedCount, 1);
  assert.equal((await post(viewer, `/archives/${id}/download`)).status, 403);
  // Normal browser download uses a one-time capability, no bearer credential in the URL.
  const ticket = (await post(app, `/archives/${id}/download`)).body.url;
  assert.equal((await request(app).get(ticket)).status, 200);
  assert.equal((await request(app).get(ticket)).status, 403);
  const preview = (await post(app, '/storage/preview', { estateId: 'a', before: '2025-01-01', keep: 1, action: 'purge' })).body;
  assert.equal((await post(app, '/storage/apply', { token: preview.token, confirmation: 'PURGE' })).status, 200);
  assert.equal((await models.Asset.findById('old')).storageState, 'purged');
  assert.equal((await post(viewer, '/storage/old/restore')).status, 403);
  assert.equal((await post(app, '/storage/old/restore')).status, 200);
  assert.equal(await fs.readFile(path.join(root, 'estates/a/images/old.png'), 'utf8'), 'image fixture');
  assert.equal((await models.Asset.findById('old')).storageState, 'active');
  assert.ok(await models.Activity.exists({ _id: 'activity-a' }));
});
test('tampering blocks purge even after verification, and failed verification revokes eligibility', async () => {
  const id = await snapshot(); await verify(id);
  await fs.writeFile(path.join(root, 'archives', id, 'files/estates/a/images/old.png'), 'bad archive');
  await models.Asset.updateOne({ _id: 'old' }, { $set: { storageState: 'retired', retiredAt: new Date('2024-01-01') } });
  const preview = (await post(app, '/storage/preview', { estateId: 'a', before: '2025-01-01', keep: 1, action: 'purge' })).body;
  assert.equal((await post(app, '/storage/apply', { token: preview.token, confirmation: 'PURGE' })).status, 409);
  assert.equal(await fs.readFile(path.join(root, 'estates/a/images/old.png'), 'utf8'), 'image fixture');
  assert.equal((await post(app, `/archives/${id}/verify`)).status, 202);
  await waitFor(id, 'failed');
  assert.equal((await post(app, `/archives/${id}/download`)).status, 409);
});
test('missing assets and symlinked dependencies never produce a successful archive', async () => {
  await fs.symlink('/etc/hosts', path.join(root, 'estates/a/qgis/unsafe'));
  let r = await post(app, '/archives', { estateId: 'a' });
  await waitFor(r.body._id, 'failed');
  await fs.unlink(path.join(root, 'estates/a/qgis/unsafe'));
  await fs.rename(path.join(root, 'estates/a/images/old.png'), path.join(root, 'old-fixture'));
  r = await post(app, '/archives', { estateId: 'a' });
  await waitFor(r.body._id, 'failed');
  await fs.rename(path.join(root, 'old-fixture'), path.join(root, 'estates/a/images/old.png'));
});
