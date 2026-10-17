// Additive, resumable OBAN-only import. No updates to existing cost/usage rows.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import * as models from '../../apps/api/src/model/index.js';
import {OBAN_ESTATE_ID,importVehicleDataset} from '../../apps/api/src/service/vehicle-import.js';
const filename = process.argv[2];
if(!filename) throw Error('Provide the organized vehicle JSON file');
const dataset=JSON.parse(await fs.readFile(filename,'utf8'));
const rawFile=path.join(path.dirname(filename),'vehicle-report-clipboard.txt');
const sourceBytes=await fs.readFile(rawFile);
assert.equal(createHash('sha256').update(sourceBytes).digest('hex'),dataset.metadata.source_sha256,'Raw source checksum differs');
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try {
  const sourcePath=path.relative(process.env.DATA_DIR||path.dirname(filename),filename);
  console.log(JSON.stringify(await importVehicleDataset(models,dataset,{estateId:OBAN_ESTATE_ID,apply:process.argv.includes('--apply'),sourcePath,importedBy:'owner-authorized-20261017'})));
} finally {await mongoose.disconnect();}
