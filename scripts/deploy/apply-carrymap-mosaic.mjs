// Run with the private Mapping environment. Dry-run unless --apply is supplied.
// Updates only the existing reference asset; keeps the previous file for rollback.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import {createModels} from '../../apps/api/src/model/index.js';
import {fileHash,secureStoredFile} from '../../apps/api/src/service/files.js';
import {readMosaicTile} from '../../apps/api/src/service/mosaic.js';
const [filename,mode]=process.argv.slice(2);
assert.ok(filename && process.env.MONGODB_URI && process.env.DATA_DIR);
assert.ok(!mode || mode==='--apply');
const p=JSON.parse(await fs.readFile(filename,'utf8'));
await mongoose.connect(process.env.MONGODB_URI);
try {
  const {Estate,Asset}=createModels();
  const estate=await Estate.findById(p.estateId).lean();
  assert.equal(estate?.name,'Oban Nigeria');
  const previous=await Asset.findById(p.assetId).lean();
  assert.equal(previous?.estateId,p.estateId);
  assert.equal(previous?.kind,'reference-image');
  assert.equal(previous.file.sha256,p.expectedOverviewSha256,'Overview changed; review again');
  assert.ok(!previous.mosaic?.levels?.length,'Already updated; review before replacing');
  assert.equal(p.mosaic.levels.length,9);
  for(const item of [p.mosaic,p.file]) {
    assert.ok(item.path.startsWith(`estates/${p.estateId}/reference/20261010/`));
    const file=await secureStoredFile(process.env.DATA_DIR,item.path);
    assert.equal((await fs.stat(file)).size,item.bytes);
    assert.equal(await fileHash(file),item.sha256);
  }
  for(const z of [0,4,8]) {
    const level=p.mosaic.levels[z];
    assert.ok(await readMosaicTile(process.env.DATA_DIR,p.mosaic,z,Math.floor(level.cols/2),Math.floor(level.rows/2)));
  }
  const fields={mosaic:p.mosaic,file:p.file,bounds:p.bounds,name:'Oban CarryMap mosaic',attribution:'Oban estate · supplied CarryMap imagery',importedAt:'2026-10-10',resolution:undefined};
  assert.equal(new Asset({...previous,...fields}).validateSync(),undefined);
  if(mode==='--apply') {
    const backup=path.join(process.env.DATA_DIR,`.before-carrymap-${p.mosaic.sha256}.json`);
    await fs.writeFile(backup,JSON.stringify(previous),{flag:'wx',mode:0o600});
    const {resolution,...set}=fields;
    const result=await Asset.updateOne({_id:p.assetId,updatedAt:previous.updatedAt,'file.sha256':p.expectedOverviewSha256},{$set:set,$unset:{resolution:1}},{runValidators:true});
    assert.equal(result.matchedCount,1,'Concurrent asset edit; review the saved backup');
  }
  console.log(JSON.stringify({mode:mode||'dry-run',asset:p.assetId,levels:9,sourceBytes:p.mosaic.bytes}));
} finally { await mongoose.disconnect(); }
