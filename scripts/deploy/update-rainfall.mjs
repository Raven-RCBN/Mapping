// Explicit source revision. Dry-run by default; preserves a private rollback snapshot.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import {Estate,AnnualRainfall} from '../../apps/api/src/model/index.js';
const [filename,mode]=process.argv.slice(2);
assert.ok(filename&&(!mode||mode==='--apply'));
const p=JSON.parse(await fs.readFile(filename,'utf8'));
assert.equal(p.estateId,'f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae');
assert.equal(p.sourceId,'comparative-rainfall-20261015');
assert.equal(p.records.length,10);
assert.deepEqual(p.records.map(r=>r.year),Array.from({length:10},(_,i)=>2017+i));
const rows=p.records.map(r=>({...r,_id:`rain-${p.estateId}-${p.sourceId}-${r.year}`,estateId:p.estateId,sourceId:p.sourceId,sourceName:p.sourceName,sourceFile:p.sourceFile,active:true}));
for(const r of rows){
 assert.equal(new AnnualRainfall(r).validateSync(),undefined);
 assert.equal(r.monthly.length,12);
 assert.deepEqual(r.monthly.map(m=>m.month),Array.from({length:12},(_,i)=>i+1));
 assert.equal(r.monthly.reduce((n,m)=>n+(m.mm??0),0),r.monthlySumMm);
 assert.equal(r.monthly.reduce((n,m)=>n+(m.rainDays??0),0),r.rainDays);
}
const ytd=rows.find(r=>r.year===2026);
assert.equal(ytd.mm,3392);assert.equal(ytd.rainDays,148);assert.equal(ytd.toMonth,9);assert.equal(ytd.partial,true);
assert.ok(ytd.monthly.slice(9).every(m=>m.mm===null&&m.rainDays===null&&m.status==='not_supplied'));
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try{
 assert.equal((await Estate.findById(p.estateId).lean())?.name,'Oban Nigeria');
 const where={estateId:p.estateId,year:{$in:rows.map(r=>r.year)}};
 const before=await AnnualRainfall.find(where).lean();
 for(const r of rows){const existing=before.find(v=>v._id===r._id);if(existing)for(const key of Object.keys(r))assert.deepEqual(JSON.parse(JSON.stringify(existing[key])),r[key],`New-source record has changed: ${r.year} ${key}`);}
 const summary={mode:mode||'dry-run',years:rows.map(r=>r.year),previousActive:before.filter(r=>r.active).map(({year,mm,sourceId})=>({year,mm,sourceId})),ytd:{mm:ytd.mm,rainDays:ytd.rainDays,toMonth:ytd.toMonth},reportedTotalDifferences:rows.filter(r=>r.mm!==r.monthlySumMm).map(({year,mm,monthlySumMm})=>({year,reported: mm,monthlySum:monthlySumMm}))};
 if(mode==='--apply'){
  assert.ok(process.env.DATA_DIR);
  const dir=path.join(process.env.DATA_DIR,'estates',p.estateId,'imports','rainfall-imports');await fs.mkdir(dir,{recursive:true,mode:0o700});
  const hash=createHash('sha256').update(JSON.stringify(before)).digest('hex').slice(0,16);
  const backup=path.join(dir,`20261015-before-${hash}.json`);
  try{await fs.writeFile(backup,JSON.stringify({where,before,payload:p},null,2),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  const newIds=rows.map(r=>r._id);
  try{
   await AnnualRainfall.updateMany({...where,_id:{$nin:newIds},active:true},{$set:{active:false}});
   await AnnualRainfall.bulkWrite(rows.map(r=>({updateOne:{filter:{_id:r._id},update:{$setOnInsert:r},upsert:true}})));
   const active=await AnnualRainfall.find({...where,active:true}).lean();
   assert.equal(active.length,10);
   for(const r of rows){const saved=active.find(v=>v._id===r._id);assert.ok(saved);assert.equal(saved.mm,r.mm);assert.equal(saved.monthly.length,12);}
  }catch(e){
   await AnnualRainfall.updateMany({...where,_id:{$in:newIds}},{$set:{active:false}});
   for(const previous of before)await AnnualRainfall.updateOne({_id:previous._id},{$set:{active:previous.active}});
   throw e;
  }
  summary.backup=backup;
 }
 console.log(JSON.stringify(summary,null,2));
}finally{await mongoose.disconnect();}
