// Run as the existing API owner. No credential values or record contents are printed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [hostRoot, output] = process.argv.slice(2);
if (!path.isAbsolute(hostRoot || '') || !path.isAbsolute(output || ''))
  throw Error('Usage: node export-mapping-metadata.mjs ABS_HOST_API_ROOT ABS_PRIVATE_OUTPUT');
process.chdir(hostRoot);
const { default: mongoose } = await import(pathToFileURL(path.join(hostRoot, 'node_modules/mongoose/index.js')));
await import(pathToFileURL(path.join(hostRoot, 'config/Mongo.js')));
const names = ['estates', 'assets', 'activities', 'sources', 'accessgrants', 'blocks', 'harvestingactivities', 'fieldactivities'];
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const manifest = { capturedAt: new Date().toISOString(), consistentSnapshot: false, collections: [] };
try {
  for (const suffix of names) {
    const name = 'estateatlas' + suffix;
    const documents = await mongoose.connection.db.collection(name).find({}).sort({ _id: 1 }).toArray();
    const text = mongoose.mongo.BSON.EJSON.stringify(documents, { relaxed: false });
    await fs.writeFile(path.join(output, name + '.json'), text, { mode: 0o600, flag: 'wx' });
    manifest.collections.push({ name, count: documents.length, sha256: createHash('sha256').update(text).digest('hex') });
  }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(manifest));
} finally { await mongoose.disconnect(); }
