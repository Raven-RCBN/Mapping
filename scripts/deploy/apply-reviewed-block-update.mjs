// Run with the private service environment and a reviewed, private JSON payload.
// Dry-run by default. No estate boundaries, activities or existing assets are changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import { createModels } from '../../apps/api/src/model/index.js';
import { secureStoredFile, fileHash } from '../../apps/api/src/service/files.js';
const [filename, mode] = process.argv.slice(2);
if (!filename || !process.env.MONGODB_URI || !process.env.DATA_DIR) throw Error('Payload and private service environment required');
if (mode && mode !== '--apply') throw Error('Use --apply or omit for dry-run');
const raw = await fs.readFile(filename), p = JSON.parse(raw);
const digest = createHash('sha256').update(raw).digest('hex');
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
await mongoose.connect(process.env.MONGODB_URI);
try {
  const m = createModels(), id = p.estateId;
  assert.match(id,/^[a-zA-Z0-9-]{1,80}$/);
  assert.equal(p.version,1);
  const estate = await m.Estate.findById(id).lean();
  assert.equal(estate?.gisImportId,p.expectedGisImportId,'Estate import changed; review again');
  const blocks = await m.Block.find({estateId:id}).sort({_id:1}).lean();
  assert.equal(blocks.length,p.expectedBlockCount);
  assert.equal(canonical(JSON.parse(JSON.stringify(blocks))),canonical(p.expectedBlocks),'Live block records changed; review again');
  const allowed = new Set(['plantingYear','plantingYearDescription','gpsAreaHa','sourceYieldLastYear','sourceYieldTwoYears']);
  const ids = new Set();
  for (const u of p.updates) {
    assert.ok(!ids.has(u.id)); ids.add(u.id);
    const b = blocks.find(b=>b._id===u.id && b.blockCode===u.blockCode);
    assert.ok(b,'Missing existing block');
    assert.ok(Object.keys(u.fields).every(k=>allowed.has(k)));
    for(const [k,v] of Object.entries(u.expected)) assert.deepEqual(b[k],v);
    assert.equal(new m.Block({...b,...u.fields}).validateSync(),undefined);
  }
  for (const [Model,rows] of [[m.Block,p.additions],[m.Asset,p.assets]]) {
    for (const row of rows) {
      assert.equal(row.estateId,id); assert.ok(row._id.startsWith(id+'-'));
      assert.ok(!ids.has(row._id)); ids.add(row._id);
      assert.equal(await Model.exists({_id:row._id}),null,'New record already exists');
      assert.equal(new Model(row).validateSync(),undefined);
      if (Model===m.Block) assert.deepEqual(row.mapBlockNames,[],'New geometries require a different review');
      else {
        assert.equal(row.kind,'reference-image'); assert.ok(!row.acquiredAt,'Reference capture date must not be invented');
        assert.ok(row.file.path.startsWith('estates/'+id+'/reference/'));
        const file=await secureStoredFile(process.env.DATA_DIR,row.file.path);
        assert.equal((await fs.stat(file)).size,row.file.bytes);
        assert.equal(await fileHash(file),row.file.sha256);
      }
    }
  }
  const plan={existingBlocks:p.updates.length,newTableOnlyBlocks:p.additions.length,referenceImages:p.assets.length,mode:mode||'dry-run'};
  if(mode==='--apply') {
    const backup=path.join(process.env.DATA_DIR,'.reviewed-block-update-'+digest+'.json');
    await fs.writeFile(backup,JSON.stringify({estate,blocks,payload:p}),{flag:'wx',mode:0o600});
    // Each replacement is conditional on the reviewed version; never overwrite a concurrent edit.
    for(const u of p.updates) {
      const b=blocks.find(b=>b._id===u.id);
      const result=await m.Block.updateOne({_id:b._id,estateId:id,updatedAt:b.updatedAt},{$set:u.fields},{runValidators:true});
      assert.equal(result.matchedCount,1,'Concurrent block edit; stop and review the private backup');
    }
    if(p.additions.length) await m.Block.insertMany(p.additions);
    if(p.assets.length) await m.Asset.insertMany(p.assets);
    assert.equal(await m.Block.countDocuments({estateId:id}),blocks.length+p.additions.length);
    assert.equal(canonical(await m.Estate.findById(id).lean()),canonical(estate),'Estate boundary must remain unchanged');
  }
  console.log(JSON.stringify(plan));
} finally { await mongoose.disconnect(); }
