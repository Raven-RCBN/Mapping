// Run by the cutover administrator only after independent activation. Secrets stay in env.
// Creates UUID-scoped synthetic fixtures, verifies HTTPS/API/storage, then removes only those fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import sharp from '../../apps/api/node_modules/sharp/lib/index.js';
import { createModels } from '../../apps/api/src/model/index.js';
import { sessionModels, passwordHash } from '../../apps/api/src/service/session-auth.js';
const origin = process.env.MAPPING_ACCEPT_ORIGIN || 'https://mapping.digitalpalm.ai';
const local = process.env.MAPPING_ACCEPT_LOCAL_TEST === '1';
if (origin !== 'https://mapping.digitalpalm.ai' && !(local && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin))) throw Error('Unexpected acceptance origin');
const requestOrigin = local ? 'https://mapping.example.test' : origin;
const uri = process.env.MAPPING_ACCEPT_URI;
const dataDir = process.env.MAPPING_ACCEPT_DATA_DIR;
const password = process.env.MAPPING_ACCEPT_ADMIN_PASSWORD;
const reportFile = process.env.MAPPING_ACCEPT_REPORT;
if (!uri || !dataDir || !password || !reportFile || !path.isAbsolute(dataDir) || !path.isAbsolute(reportFile)) throw Error('Set acceptance URI, data directory, admin password and private report path');
const fixture = 'acceptance-' + randomUUID();
const userIds = ['viewer-' + fixture, 'manager-' + fixture];
const report = { sourceRelease: '5336eff', fixture, startedAt: new Date().toISOString(), checks: [], cleanup: false };
await fs.writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
const check = (ok, name) => { if (!ok) throw Error(name); report.checks.push(name); };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const api = '/api/EstateAtlas';
let models, sessions, adminCookie, viewerCookie, managerCookie, baseline, failure;
async function call(route, cookie, method = 'GET', body) {
  const headers = { Origin: requestOrigin, 'X-Mapping-Client': '1', ...(cookie ? { Cookie: cookie } : {}) };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return fetch(origin + route, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(60000) });
}
async function json(route, cookie) {
  const r = await call(route, cookie); check(r.status === 200, 'GET ' + route.split('?')[0] + ' returns 200'); return r.json();
}
async function login(name, secret) {
  const r = await call('/api/v1/users/login', null, 'POST', { login: name, password: secret });
  check(r.status === 200, 'Independent login succeeds');
  const h = r.headers.get('set-cookie') || '';
  check(['__Host-mapping-session=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'].every(x => h.includes(x)), 'Session cookie protections');
  const body = await r.json(); check(body.data?.authenticated === true && !body.data?.token, 'No bearer token returned to browser');
  return h.split(';')[0];
}
async function recordsDigest() {
  const result = {};
  for (const [name, model] of Object.entries(models)) {
    const docs = await model.find({}).sort({ _id: 1 }).lean();
    result[name] = { count: docs.length, hash: digest(mongoose.mongo.BSON.EJSON.stringify(docs, { relaxed: false })) };
  }
  return result;
}
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  check(mongoose.connection.name === 'DigitalPalmMapping' || (local && mongoose.connection.name.startsWith('MappingTest_')), 'Dedicated target database');
  if (!local) check(mongoose.connection.port === 27031, 'Dedicated Mongo process on port 27031');
  models = createModels(mongoose); sessions = sessionModels(mongoose.connection);
  baseline = await recordsDigest(); report.baselineCounts = Object.fromEntries(Object.entries(baseline).map(([k,v]) => [k,v.count]));
  check((await json(api + '/health')).auth === 'mapping-session', 'Active upstream uses independent sessions');
  check((await call(api + '/bootstrap')).status === 401, 'Anonymous estate access denied');
  check((await call('/api/v1/users/login', null, 'POST', { login: 'Admin', password: 'intentionally-invalid' })).status === 401, 'Invalid password denied');
  adminCookie = await login(process.env.MAPPING_ACCEPT_ADMIN_NAME || 'Admin', password);
  const bootstrap = await json(api + '/bootstrap', adminCookie);
  check(bootstrap.access?.role === 'admin' && bootstrap.estates.length === baseline.Estate.count, 'Administrator sees migrated estates');
  for (const estate of bootstrap.estates) {
    const workspace = await json(api + '/workspace?estates=' + estate.id, adminCookie);
    check(workspace.estates.length === 1 && workspace.estates[0].id === estate.id && workspace.blocks.every(b => b.estateId === estate.id), 'Workspace estate isolation');
    for (const kind of ['blocks', 'harvesting', 'field']) {
      const page = await json(api + '/records/' + kind + '?estates=' + estate.id + '&limit=2', adminCookie);
      check(page.items.every(r => r.estateId === estate.id) && page.items.length <= 2, kind + ' page is scoped and bounded');
      if (page.nextCursor) {
        const next = await json(api + '/records/' + kind + '?estates=' + estate.id + '&limit=2&cursor=' + encodeURIComponent(page.nextCursor), adminCookie);
        check(!next.items.some(r => page.items.some(first => first.id === r.id)), kind + ' cursor has no repeated rows');
      }
    }
    const pack = await json(api + '/offline?estates=' + estate.id, adminCookie);
    check(pack.snapshot.estates.length === 1 && pack.snapshot.estates[0].id === estate.id, 'Offline manifest estate scope');
    // Verify every downloaded offline file, not only the manifest.
    for (const file of pack.files) {
      check(file.url.startsWith(api + '/assets/') && !file.url.includes('://'), 'Offline file remains same-origin');
      const response = await call(file.url, adminCookie);
      check(response.status === 200 && digest(Buffer.from(await response.arrayBuffer())) === file.sha256, 'Offline file checksum');
    }
    if (estate.qgis) {
      const xy = [];
      const walk = (v) => { if (typeof v?.[0] === 'number') xy.push(v); else if (Array.isArray(v)) v.forEach(walk); };
      workspace.estates[0].boundary?.features?.forEach(f => walk(f.geometry?.coordinates));
      check(xy.length > 0, 'QGIS estate extent available');
      const xs = xy.map(p => p[0] * 20037508.34 / 180);
      const ys = xy.map(p => Math.log(Math.tan((90 + p[1]) * Math.PI / 360)) * 20037508.34 / Math.PI);
      const q = new URLSearchParams({ LAYERS: 'terrain', WIDTH: '128', HEIGHT: '128', BBOX: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].join(',') });
      const image = await call(api + '/estates/' + estate.id + '/qgis?' + q, adminCookie);
      check(image.status === 200 && Buffer.from(await image.arrayBuffer()).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'HTTPS QGIS rendering');
    }
  }
  check(!(await models.Estate.exists({ _id: fixture })), 'Fixture ID is new');
  await models.Estate.create({ _id: fixture, name: 'Temporary acceptance fixture', location: 'Synthetic test only' });
  await models.Block.create({ _id: fixture + '-block', estateId: fixture, blockCode: 'TEST' });
  const secret = randomBytes(32).toString('hex');
  const encoded = await passwordHash(secret);
  for (const [i, role] of ['viewer', 'manager'].entries()) await sessions.User.create({ _id: userIds[i], passwordHash: encoded, role, active: true, estateIds: [fixture] });
  viewerCookie = await login(userIds[0], secret); managerCookie = await login(userIds[1], secret);
  check((await json(api + '/bootstrap', viewerCookie)).estates.every(e => e.id === fixture), 'Viewer cannot see other estates');
  if (bootstrap.estates.length) check((await call(api + '/workspace?estates=' + bootstrap.estates[0].id, viewerCookie)).status === 403, 'Viewer explicit cross-estate read denied');
  const common = { estateId: fixture, blockId: fixture + '-block', workDate: '2000-01-01', gang: 'Acceptance fixture', geolocation: null };
  const field = { ...common, activityCode: 'TEST', activityDescription: 'Temporary acceptance test', mandays: 1 };
  check((await call(api + '/field-activities', viewerCookie, 'POST', field)).status === 403, 'Viewer writes denied');
  for (const [route, payload] of [['field-activities', field], ['harvesting', { ...common, employeeNo: 'TEST', employeeName: 'Synthetic worker', bunches: 1 }]]) {
    const r = await call(api + '/' + route, managerCookie, 'POST', payload); check(r.status === 201, route + ' write succeeds');
    const row = await r.json();
    check((await json(api + '/' + route + '?estates=' + fixture, managerCookie)).items.some(x => x.id === row.id), route + ' persists through API');
  }
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#245435' } }).png().toBuffer();
  const form = new FormData(); form.set('name', 'Synthetic acceptance image'); form.set('acquiredAt', '2000-01-01'); form.set('bounds', '[[0,0],[0.001,0.001]]'); form.set('file', new Blob([png], { type: 'image/png' }), 'acceptance.png');
  const uploaded = await call(api + '/estates/' + fixture + '/images', managerCookie, 'POST', form);
  check(uploaded.status === 201, 'Synthetic image upload succeeds');
  const asset = await uploaded.json(); const stored = await models.Asset.findById(asset.id).lean();
  check(stored?.estateId === fixture && stored.file.path.startsWith('estates/' + fixture + '/images/'), 'Upload stored in dedicated estate folder');
  check(digest(await fs.readFile(path.join(dataDir, stored.file.path))) === stored.file.sha256, 'Upload persists in Mapping-owned storage');
  check((await call(asset.url)).status === 401, 'Anonymous image download denied');
  check((await call('/api/v1/users/logout', viewerCookie, 'POST')).status === 204, 'Logout succeeds');
  check((await call(api + '/bootstrap', viewerCookie)).status === 401, 'Logged-out session rejected');
  await sessions.Session.updateMany({ subject: userIds[1] }, { expiresAt: new Date(0) });
  check((await call(api + '/bootstrap', managerCookie)).status === 401, 'Expired session rejected');
} catch (e) { failure = e; report.failure = e.name === 'Error' ? e.message : e.name; }
finally {
  if (models && sessions) {
    try {
      await sessions.Session.deleteMany({ subject: { $in: userIds } });
      await sessions.User.deleteMany({ _id: { $in: userIds } });
      for (const [name, model] of Object.entries(models)) {
        if (name === 'Estate') await model.deleteOne({ _id: fixture });
        else if (name !== 'AccessGrant') await model.deleteMany({ estateId: fixture });
      }
      await fs.rm(path.join(dataDir, 'estates', fixture), { recursive: true, force: true });
      if (adminCookie) await call('/api/v1/users/logout', adminCookie, 'POST');
      const after = await recordsDigest();
      check(JSON.stringify(after) === JSON.stringify(baseline), 'All original metadata unchanged after fixture cleanup');
      report.cleanup = true;
    } catch (e) { failure ||= e; report.cleanupFailure = e.name === 'Error' ? e.message : e.name; }
  }
  await mongoose.disconnect();
  report.finishedAt = new Date().toISOString(); report.ok = !failure;
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: report.ok, checks: report.checks.length, fixture, cleanup: report.cleanup, reportFile }));
}
if (failure) process.exitCode = 1;
