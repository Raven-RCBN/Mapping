// Idempotent, additive import into the dedicated annual rainfall collection.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import {Estate,AnnualRainfall} from '../../apps/api/src/model/index.js';
const payload=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const apply=process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try {
 assert.ok(await Estate.exists({_id:payload.estateId}));
 assert.equal(new Set(payload.records.map(r=>r.year)).size,payload.records.length);
 const rows=payload.records.map(r=>({...r,_id:`rain-${payload.estateId}-${payload.sourceId}-${r.year}`,estateId:payload.estateId,sourceId:payload.sourceId,sourceName:payload.sourceName,sourceFile:payload.sourceFile,active:true}));
 for(const row of rows){
  assert.ok(Number.isInteger(row.year)&&Number.isFinite(row.mm)&&row.fromMonth<=row.toMonth);
  assert.equal(new AnnualRainfall(row).validateSync(),undefined);
  const existing=await AnnualRainfall.findById(row._id).lean();
  if(existing)for(const key of Object.keys(row))assert.deepEqual(existing[key],row[key],`Existing rainfall differs: ${row.year} ${key}`);
  const active=await AnnualRainfall.findOne({estateId:row.estateId,year:row.year,active:true}).lean();
  assert.ok(!active||active._id===row._id,'A different active source exists; review before replacing it');
 }
 if(apply){
  await AnnualRainfall.createIndexes();
  await AnnualRainfall.bulkWrite(rows.map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:row},upsert:true}})));
  assert.equal(await AnnualRainfall.countDocuments({_id:{$in:rows.map(r=>r._id)}}),rows.length);
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',collection:AnnualRainfall.collection.name,records:rows.length,years:rows.map(r=>r.year)}));
} finally {await mongoose.disconnect();}
