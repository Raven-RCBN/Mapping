// Additive annual block allocation. The payload contains no employee data or costs.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import {Estate,Wage,WageArea,BlockManday} from '../../apps/api/src/model/index.js';
import {allocateMinor} from '../../packages/shared/wages.js';
const [filename,mode]=process.argv.slice(2),p=JSON.parse(await fs.readFile(filename,'utf8'));
assert.equal(p.version,1);assert.equal(p.year,2025);assert.ok(p.records.length>0);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try {
  const estate=await Estate.findById(p.estateId).lean();assert.equal(estate?.name,'Oban Nigeria');
  const polygons=new Set(estate.boundary.features.map(f=>f.properties.blockName||f.properties.Block_No));
  const areas=await WageArea.find({estateId:p.estateId,year:p.year}).sort({_id:1}).lean();
  const wages=await Wage.find({estateId:p.estateId}).sort({_id:1}).lean(),before=hash(wages);
  const allowed=new Set(wages.filter(r=>r.basis==='monthly'&&r.period.startsWith(String(p.year))).map(r=>JSON.stringify([r.division,r.task,r.activity])));
  const rows=[];
  for(const r of p.records) {
    assert.ok(Number.isSafeInteger(r.mandayUnits)&&r.mandayUnits>=0);
    assert.notEqual(r.task,'MILL');assert.ok(allowed.has(JSON.stringify([r.division,r.task,r.activity])));
    const group=areas.filter(a=>a.division===r.division&&a.mapBlockCode&&polygons.has(a.mapBlockCode)&&a.mapHa>0);
    assert.ok(group.length);const divisionHa=group.reduce((n,a)=>n+a.mapHa,0),parts=allocateMinor(r.mandayUnits,group);
    assert.equal(parts.reduce((a,b)=>a+b,0),r.mandayUnits);
    group.forEach((a,i)=>{
      const sourceKey=JSON.stringify([p.year,a.mapBlockCode,r.task,r.activity]);
      rows.push({_id:'md-'+hash([p.estateId,sourceKey]).slice(0,40),estateId:p.estateId,year:p.year,mapBlockCode:a.mapBlockCode,
        division:r.division,task:r.task,activity:r.activity,mandayUnits:parts[i],mapHa:a.mapHa,divisionHa,
        sourceSystem:p.sourceSystem,sourceKey,sourceFile:p.sourceFile,sourceHash:p.sourceHash,revision:0,updatedBy:'owner-authorized-mandays-import'});
    });
  }
  assert.equal(new Set(rows.map(r=>r._id)).size,rows.length);
  for(const row of rows)assert.equal(new BlockManday(row).validateSync(),undefined);
  const existing=await BlockManday.find({estateId:p.estateId,year:p.year}).lean();
  let inserted=0;
  if(mode==='--apply') {
    const dir=path.join(process.env.DATA_DIR,'mandays-imports');await fs.mkdir(dir,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(dir,new Date().toISOString().replaceAll(':','-')+'-before.json'),JSON.stringify(existing),{flag:'wx',mode:0o600});
    await BlockManday.createIndexes();
    for(let i=0;i<rows.length;i+=500){const result=await BlockManday.bulkWrite(rows.slice(i,i+500).map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:row},upsert:true}})));inserted+=result.upsertedCount;}
    const actual=await BlockManday.find({_id:{$in:rows.map(r=>r._id)}}).lean();assert.equal(actual.length,rows.length);
    assert.equal(actual.reduce((n,r)=>n+r.mandayUnits,0),rows.reduce((n,r)=>n+r.mandayUnits,0));
  }
  assert.equal(hash(await Wage.find({estateId:p.estateId}).sort({_id:1}).lean()),before);
  console.log(JSON.stringify({mode:mode==='--apply'?'applied':'dry-run',activityGroups:p.records.length,blockRecords:rows.length,blocks:new Set(rows.map(r=>r.mapBlockCode)).size,mandays:rows.reduce((n,r)=>n+r.mandayUnits,0)/1e6,inserted,wagesUnchanged:true}));
} finally {await mongoose.disconnect();}
