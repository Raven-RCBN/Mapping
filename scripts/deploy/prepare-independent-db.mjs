// Dedicated database only. Import into an empty destination; never overwrite live records.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import { createModels } from '../../apps/api/src/model/index.js';
import { passwordHash, sessionModels } from '../../apps/api/src/service/session-auth.js';
const [archive] = process.argv.slice(2);
if (!archive || !process.env.MAPPING_TARGET_URI || !process.env.MAPPING_ADMIN_PASSWORD)
  throw Error('Set MAPPING_TARGET_URI, MAPPING_ADMIN_PASSWORD and pass a metadata archive directory.');
const manifest = JSON.parse(await fs.readFile(path.join(archive, 'manifest.json'), 'utf8'));
const names = ['estates', 'assets', 'activities', 'sources', 'accessgrants', 'blocks', 'harvestingactivities', 'fieldactivities'];
if (manifest.collections.length !== names.length || names.some(n => !manifest.collections.some(c => c.name === 'estateatlas' + n))) throw Error('Unexpected archive collections');
const entries = [];
for (const item of manifest.collections) {
  const text = await fs.readFile(path.join(archive, item.name + '.json'), 'utf8');
  if (createHash('sha256').update(text).digest('hex') !== item.sha256) throw Error('Archive hash mismatch');
  const docs = mongoose.mongo.BSON.EJSON.parse(text);
  if (!Array.isArray(docs) || docs.length !== item.count) throw Error('Archive count mismatch');
  entries.push({ name: item.name.replace(/^estateatlas/, 'mapping'), docs });
}
const password = await passwordHash(process.env.MAPPING_ADMIN_PASSWORD);
delete process.env.MAPPING_ADMIN_PASSWORD;
await mongoose.connect(process.env.MAPPING_TARGET_URI);
try {
  if (mongoose.connection.name !== 'DigitalPalmMapping') throw Error('Destination must be the dedicated DigitalPalmMapping database.');
  if ((await mongoose.connection.db.listCollections().toArray()).length) throw Error('Destination is not empty. Inspect it before retrying; no data has been replaced.');
  for (const {name, docs} of entries) {
    // Old grants refer to AgriNexus identities. Retain them only in the private archive.
    if (name === 'mappingaccessgrants') continue;
    if (docs.length) await mongoose.connection.db.collection(name).insertMany(docs);
  }
  for (const model of Object.values(createModels(mongoose))) await model.createIndexes();
  const { User, Session } = sessionModels(mongoose.connection);
  await Promise.all([User.createIndexes(), Session.createIndexes()]);
  await User.create({ _id: process.env.MAPPING_ADMIN_NAME || 'Admin', passwordHash: password, active: true, role: 'admin', estateIds: [] });
  console.log('Independent database imported and Mapping administrator created. No AgriNexus user or password was copied.');
} finally { await mongoose.disconnect(); }
