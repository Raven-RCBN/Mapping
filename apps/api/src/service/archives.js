import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { canAccess } from './auth.js';
import { selection } from './queries.js';
import { QueryError } from './performance.js';
import { secureStoredFile, fileHash, resolveStoredFile } from './files.js';

// Explicit allowlist: credentials, sessions and access grants never enter estate exports.
const COLLECTIONS = ['Estate', 'Asset', 'Activity', 'Source', 'Block', 'HarvestingActivity',
  'FieldActivity', 'ProductionName', 'ProductionComment', 'MonthlyProduction',
  'YearlyProduction', 'Wage', 'WageArea', 'BlockManday', 'AnnualRainfall',
  'Vehicle', 'VehicleImport', 'VehicleTransaction', 'VehicleUsage', 'TrialBalanceSummary', 'TrialBalanceDetail'];
const admin = (req, res, next) => req.access.role === 'admin' ? next() :
  res.status(403).json({ error: 'Administrator access is required to manage archives.' });
const estateId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const archiveId = z.string().uuid();
const scopeFor = (name, id) => name === 'Estate' ? { _id: id } : { estateId: id };
const hash = value => createHash('sha256').update(value).digest('hex');
async function* lines(filename) {
  const input = createReadStream(filename);
  const reader = createInterface({ input, crlfDelay: Infinity });
  try { for await (const line of reader) if (line) yield JSON.parse(line); }
  finally { reader.close(); input.destroy(); }
}
async function* walk(root, relative) {
  const full = resolveStoredFile(root, relative);
  const stat = await fs.lstat(full);
  if (stat.isSymbolicLink()) throw new QueryError('Remove symbolic links from estate storage before archiving.', 409);
  if (stat.isDirectory()) {
    for (const name of (await fs.readdir(full)).sort()) yield* walk(root, `${relative}/${name}`);
  } else if (stat.isFile()) {
    await secureStoredFile(root, relative);
    yield { path: relative, bytes: stat.size };
  } else throw new QueryError('Unsupported file in estate storage.', 409);
}
async function exportRecords(model, scope, filename) {
  const output = filename ? await fs.open(filename, 'wx', 0o600) : null;
  const digest = createHash('sha256'); let count = 0, bytes = 0;
  try {
    for await (const row of model.find(scope).select('-archiveId').sort({ _id: 1 }).lean().cursor()) {
      const line = JSON.stringify(row) + '\n'; digest.update(line); bytes += Buffer.byteLength(line); count++;
      if (output) await output.writeFile(line);
    }
  } finally { await output?.close(); }
  return { sha256: digest.digest('hex'), records: count, bytes };
}
export async function createArchiveManager(models, config) {
  const { Archive, Asset, Estate } = models;
  const root = path.resolve(config.archiveDir || path.join(config.dataDir, 'archives'));
  const estateRoot = path.resolve(config.dataDir, 'estates');
  if (root === estateRoot || root.startsWith(estateRoot + path.sep)) throw Error('ARCHIVE_DIR must be outside estate files.');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(root)).isSymbolicLink()) throw Error('ARCHIVE_DIR must not be a symbolic link.');
  const realRoot = await fs.realpath(root), realData = await fs.realpath(config.dataDir);
  if (realRoot === path.join(realData, 'estates') || realRoot.startsWith(path.join(realData, 'estates') + path.sep)) throw Error('Unsafe archive storage.');
  await Archive.createIndexes();
  const tickets = new Map();
  // One worker per process bounds disk pressure. The unique DB lease also prevents same-estate jobs across processes.
  let running = false, downloads = 0;
  const folder = id => path.join(root, archiveId.parse(id));
  const manifest = async row => {
    const filename = await secureStoredFile(root, `${row._id}/manifest.json`);
    const contents = await fs.readFile(filename);
    if (hash(contents) !== row.manifestHash) throw new QueryError('Archive manifest integrity check failed.', 409);
    const result = JSON.parse(contents);
    if (result.estateId !== row.estateId || result.id !== row._id) throw new QueryError('Archive scope does not match.', 409);
    return result;
  };
  const checkEntry = async (row, entry) => {
    const filename = await secureStoredFile(root, `${row._id}/${entry.path}`);
    if ((await fs.stat(filename)).size !== entry.bytes || await fileHash(filename) !== entry.sha256)
      throw new QueryError('Archive checksum mismatch. Do not purge the original files.', 409);
    return filename;
  };
  async function verify(row) {
    const m = await manifest(row);
    for (const entry of m.entries) await checkEntry(row, entry);
    await Archive.updateOne({ _id: row._id }, { $set: { verifiedAt: new Date() } });
    // Receipts are only attached after every file and record export passes verification.
    for await (const a of lines(await secureStoredFile(root, `${row._id}/records/Asset.jsonl`))) {
      if (a.storageState === 'purged' || a.storageState === 'restoring') continue;
      const entry = m.entries.find(e => e.path === `files/${a.file?.path}`);
      if (!entry || entry.sha256 !== a.file.sha256) continue;
      await Asset.updateOne({ _id: a._id, estateId: row.estateId, 'file.path': a.file.path, 'file.sha256': entry.sha256 },
        { $set: { archiveId: row._id } }, { timestamps: false });
    }
  }
  async function build(row) {
    const dir = folder(row._id);
    await fs.mkdir(dir, { mode: 0o700 });
    await fs.mkdir(path.join(dir, 'records'), { mode: 0o700 });
    await fs.mkdir(path.join(dir, 'files'), { mode: 0o700 });
    const entries = []; let recordCount = 0;
    for (const name of COLLECTIONS) {
      if (!models[name]) continue;
      const entry = { path: `records/${name}.jsonl`, ...await exportRecords(models[name], scopeFor(name, row.estateId), path.join(dir, 'records', `${name}.jsonl`)) };
      entries.push(entry); recordCount += entry.records;
    }
    const files = [];
    try { for await (const file of walk(config.dataDir, `estates/${row.estateId}`)) files.push(file); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const size = files.reduce((n, f) => n + f.bytes, 0);
    const disk = await fs.statfs(root);
    if (size + 64 * 1024 ** 2 > Number(disk.bavail) * Number(disk.bsize)) throw new QueryError('Archive disk has insufficient free space.', 409);
    for (const file of files) {
      const source = await secureStoredFile(config.dataDir, file.path), relative = `files/${file.path}`;
      const target = path.join(dir, relative);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      await fs.chmod(target, 0o600);
      const sha256 = await fileHash(target);
      if (sha256 !== await fileHash(source)) throw new QueryError('Estate files changed during archive. Retry when imports have finished.', 409);
      entries.push({ path: relative, bytes: (await fs.stat(target)).size, sha256 });
    }
    const byPath = new Map(entries.map(e => [e.path, e]));
    // Every non-purged asset and its CarryMap pyramid must be included, even if the inventory path is wrong.
    for await (const a of lines(path.join(dir, 'records/Asset.jsonl'))) {
      if (a.storageState === 'purged') continue;
      for (const file of [a.file, a.mosaic].filter(f => f?.path)) {
        const e = byPath.get(`files/${file.path}`);
        if (!e || e.sha256 !== file.sha256 || e.bytes !== file.bytes)
          throw new QueryError('An asset is missing or differs from its inventory. Repair it before archiving.', 409);
      }
    }
    // Detect concurrent imports/edits rather than labelling a changing estate as a consistent snapshot.
    for (const name of COLLECTIONS) if (models[name]) {
      const current = await exportRecords(models[name], scopeFor(name, row.estateId));
      if (current.sha256 !== byPath.get(`records/${name}.jsonl`).sha256)
        throw new QueryError('Estate records changed during archive. Retry when edits have finished.', 409);
    }
    const contents = JSON.stringify({ version: 1, id: row._id, estateId: row.estateId,
      createdAt: row.createdAt, createdBy: row.createdBy, scope: 'Full estate; all dates', entries }, null, 2);
    await fs.writeFile(path.join(dir, 'manifest.json'), contents, { mode: 0o600, flag: 'wx' });
    const receipt = { manifestHash: hash(contents), files: files.length, records: recordCount,
      bytes: entries.reduce((n, e) => n + e.bytes, 0) };
    await Archive.updateOne({ _id: row._id }, { $set: receipt });
    Object.assign(row, receipt);
  }
  function launch(row, task, success) {
    running = true;
    const heartbeat = setInterval(() => Archive.updateOne({ _id: row._id, active: true }, { $set: { heartbeatAt: new Date() } }).catch(() => {}), 10000);
    heartbeat.unref();
    Promise.resolve().then(() => task(row)).then(() => Archive.updateOne({ _id: row._id },
      { $set: { status: success, active: false, error: '' } })).catch(async error => {
      await Archive.updateOne({ _id: row._id }, { $set: { status: 'failed', active: false,
        verifiedAt: null, error: error instanceof QueryError ? error.message : 'Archive could not complete. Check available disk space and file access, then retry.' } });
      if (!row.manifestHash) await fs.rm(folder(row._id), { recursive: true, force: true });
    }).catch(error => console.error('Archive job failed:', error.message)).finally(() => { clearInterval(heartbeat); running = false; });
  }
  async function expireLeases() {
    await Archive.updateMany({ active: true, heartbeatAt: { $lt: new Date(Date.now() - 5 * 60000) } },
      { $set: { active: false, status: 'failed', verifiedAt: null, error: 'Job interrupted. Create a new archive or retry verification.' } });
  }
  async function allowed(req, id) {
    const row = await Archive.findById(archiveId.parse(id)).lean();
    if (!row) throw new QueryError('Archive not found.', 404);
    if (!canAccess(req, row.estateId)) throw new QueryError('Estate access denied.', 403);
    return row;
  }
  async function archivedFile(asset) {
    if (!asset.archiveId) throw new QueryError('Create and verify an estate archive before purging imagery.', 409);
    const row = await Archive.findOne({ _id: asset.archiveId, estateId: asset.estateId, status: 'verified', active: false }).lean();
    if (!row) throw new QueryError('A verified archive is required. Verify the archive again.', 409);
    const m = await manifest(row), entry = m.entries.find(e => e.path === `files/${asset.file.path}`);
    if (!entry || entry.sha256 !== asset.file.sha256 || entry.bytes !== asset.file.bytes)
      throw new QueryError('The verified archive does not contain this exact image.', 409);
    return checkEntry(row, entry);
  }
  async function restore(asset, subject) {
    const source = await archivedFile(asset);
    const relative = asset.file.path;
    if (asset.kind !== 'imagery' || ![`estates/${asset.estateId}/images/`, `estates/${asset.estateId}/imagery/`].some(p => relative.startsWith(p)))
      throw new QueryError('Only archived imagery can be recovered here.', 409);
    const operation = randomUUID();
    const locked = await Asset.findOneAndUpdate({ _id: asset._id, $or: [{ storageState: 'purged' },
      { storageState: 'restoring', restoreStartedAt: { $lt: new Date(Date.now() - 5 * 60000) } }] },
      { $set: { storageState: 'restoring', restoreOperation: operation, restoreStartedAt: new Date() } }, { new: true });
    if (!locked) throw new QueryError('Image state changed. Refresh and retry.', 409);
    const heartbeat = setInterval(() => Asset.updateOne({ _id: asset._id, restoreOperation: operation }, { $set: { restoreStartedAt: new Date() } }, { timestamps: false }).catch(() => {}), 10000);
    heartbeat.unref();
    const target = resolveStoredFile(config.dataDir, relative), temporary = target + '.' + randomUUID() + '.restore';
    try {
      // Retention never removes the parent directories. Validate each component before any write.
      let parent = config.dataDir;
      for (const part of relative.split('/').slice(0, -1)) {
        parent = path.join(parent, part);
        const stat = await fs.lstat(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new QueryError('Unsafe recovery directory.', 409);
      }
      try {
        const existing = await secureStoredFile(config.dataDir, relative);
        if (await fileHash(existing) !== asset.file.sha256) throw new QueryError('A different file already exists. Recovery will not overwrite it.', 409);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        await fs.copyFile(source, temporary, constants.COPYFILE_EXCL);
        if (await fileHash(temporary) !== asset.file.sha256) throw new QueryError('Recovery checksum mismatch.', 409);
        await fs.link(temporary, target); // atomic no-overwrite publication
      }
      await Asset.updateOne({ _id: asset._id, storageState: 'restoring', restoreOperation: operation }, { $set: { storageState: 'active', restoredAt: new Date(), restoredBy: subject },
        $unset: { retiredAt: '', retiredBy: '', purgedAt: '', purgedBy: '', restoreOperation: '', restoreStartedAt: '' } });
    } catch (e) {
      await Asset.updateOne({ _id: asset._id, storageState: 'restoring', restoreOperation: operation }, { $set: { storageState: 'purged' } });
      throw e;
    } finally { clearInterval(heartbeat); await fs.unlink(temporary).catch(() => {}); }
  }
  // A short-lived, one-use capability lets the browser stream large downloads directly to disk.
  // It is issued only after authenticated administrator + estate checks; it contains no session credential.
  async function download(req, res) {
    if (downloads >= 2) throw new QueryError('Two archive downloads are running. Retry shortly.', 429);
    const token = req.params.ticket, ticket = tickets.get(token); tickets.delete(token);
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (!ticket || ticket.until < Date.now()) throw new QueryError('Download link expired. Request another download.', 403);
    const row = await Archive.findOne({ _id: ticket.id, status: 'verified', active: false }).lean();
    if (!row) throw new QueryError('Verify this archive before downloading.', 409);
    await manifest(row);
    res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="mapping-${row.estateId}-${row._id}.tar.gz"`, 'X-Accel-Buffering': 'no' });
    downloads++;
    const child = spawn('tar', ['-czf', '-', '-C', folder(row._id), 'manifest.json', 'records', 'files'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.resume();
    child.on('error', () => res.destroy());
    child.on('close', code => { if (code !== 0) res.destroy(); });
    res.on('close', () => { downloads--; child.kill(); });
    child.stdout.pipe(res);
  }
  function install(api) {
    api.get('/archives', async (req, res) => {
      await expireLeases();
      const q = selection(req), scope = q.scope;
      const before = req.query.before ? z.string().datetime().parse(req.query.before) : null;
      const history = await Archive.find({ ...scope, ...(before ? { createdAt: { $lt: new Date(before) } } : {}) }).sort({ createdAt: -1 }).limit(51).lean();
      const groups = await Asset.aggregate([{ $match: scope }, { $group: { _id: { estate: '$estateId', kind: '$kind', state: { $ifNull: ['$storageState', 'active'] } },
        files: { $sum: 1 }, bytes: { $sum: { $add: [{ $ifNull: ['$file.bytes', 0] }, { $ifNull: ['$mosaic.bytes', 0] }] } } } }]);
      const records = [];
      for (const name of COLLECTIONS.filter(n => !['Estate', 'Asset', 'Source'].includes(n))) if (models[name])
        records.push({ name, count: await models[name].countDocuments(scope).maxTimeMS(10000) });
      const purged = await Asset.find({ ...scope, storageState: { $in: ['purged', 'restoring'] } }).select('_id estateId name file.bytes archiveId storageState').sort({ _id: 1 }).limit(101).lean();
      const [disk, archiveDisk, totals] = await Promise.all([fs.statfs(config.dataDir), fs.statfs(root), Archive.aggregate([{ $match: scope }, { $group: { _id: null, bytes: { $sum: '$bytes' }, verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } } } }])]);
      res.json({ groups, records, archives: history.slice(0, 50), nextBefore: history.length > 50 ? history[49].createdAt : null,
        purged: purged.slice(0, 100), morePurged: purged.length > 100, archiveBytes: totals[0]?.bytes || 0, verifiedCount: totals[0]?.verified || 0,
        freeDiskBytes: Number(disk.bavail) * Number(disk.bsize), archiveFreeBytes: Number(archiveDisk.bavail) * Number(archiveDisk.bsize),
        sameVolume: (await fs.stat(root)).dev === (await fs.stat(config.dataDir)).dev });
    });
    api.post('/archives', admin, async (req, res) => {
      const id = estateId.parse(req.body.estateId);
      if (!canAccess(req, id)) throw new QueryError('Estate access denied.', 403);
      if (!await Estate.exists({ _id: id })) throw new QueryError('Estate not found.', 404);
      if (running) throw new QueryError('An archive job is running. Retry after it finishes.', 409);
      running = true;
      let row;
      try {
        await expireLeases();
        row = (await Archive.create({ _id: randomUUID(), estateId: id, createdBy: req.access.subject, status: 'building', active: true, heartbeatAt: new Date() })).toObject(); }
      catch (e) { running = false; if (e.code === 11000) throw new QueryError('An archive job is already running for this estate.', 409); throw e; }
      launch(row, build, 'ready'); res.status(202).json(row);
    });
    api.post('/archives/:id/verify', admin, async (req, res) => {
      const row = await allowed(req, req.params.id);
      if (running || row.active || !row.manifestHash) throw new QueryError('Archive is not ready for verification.', 409);
      running = true;
      try {
        const claimed = await Archive.updateOne({ _id: row._id, active: false }, { $set: { active: true, status: 'verifying', heartbeatAt: new Date() } });
        if (!claimed.modifiedCount) throw new QueryError('Archive is busy.', 409);
      } catch (e) { running = false; if (e.code === 11000) throw new QueryError('An estate archive job is already running.', 409); throw e; }
      launch(row, verify, 'verified'); res.status(202).json({ status: 'verifying' });
    });
    api.get('/archives/:id/manifest', admin, async (req, res) => {
      const row = await allowed(req, req.params.id);
      res.json(await manifest(row));
    });
    api.post('/archives/:id/download', admin, async (req, res) => {
      const row = await allowed(req, req.params.id);
      if (row.status !== 'verified' || row.active) throw new QueryError('Verify the archive before downloading.', 409);
      for (const [key, t] of tickets) if (t.until < Date.now()) tickets.delete(key);
      while (tickets.size >= 50) tickets.delete(tickets.keys().next().value);
      const token = randomBytes(32).toString('hex');
      tickets.set(token, { id: row._id, until: Date.now() + 60000 });
      res.json({ url: `${config.publicApiPath || config.apiPath || '/api'}/archives/download/${token}` });
    });
  }
  return { install, download, archivedFile, restore };
}
