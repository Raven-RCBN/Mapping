// Run from the existing API directory, after importing its Mongo configuration.
// Inserts new EstateAtlas metadata only; never overwrites existing estate uploads.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createModels } from '../../apps/api/src/model/index.js';
export async function seedEstateAtlas(connection, seedPath, dataDir) {
  const models = createModels(connection, 'EstateAtlas');
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  for (const asset of seed.Asset || []) {
    const file = path.resolve(dataDir, asset.file.path);
    if (!file.startsWith(path.resolve(dataDir) + path.sep)) throw Error('Invalid file path');
    const bytes = await fs.readFile(file);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.file.sha256) throw Error('Checksum mismatch: ' + asset._id);
  }
  const counts = {};
  for (const name of ['Estate', 'Asset', 'Activity', 'Source']) {
    for (const original of seed[name] || []) {
      const { _id, __v, ...data } = original;
      await models[name].updateOne({ _id }, { $setOnInsert: data }, { upsert: true, timestamps: false });
    }
    counts[name] = await models[name].countDocuments();
  }
  return counts;
}
