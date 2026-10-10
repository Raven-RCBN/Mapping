// Run using Mapping's private environment. Additive, repeatable import; never replace corrections.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import * as models from '../../apps/api/src/model/index.js';
import {monthlyInput,nameInput,monthlyId} from '../../apps/api/src/service/production.js';
import {createHash} from 'node:crypto';
const [filename,mode]=process.argv.slice(2),p=JSON.parse(await fs.readFile(filename,'utf8'));
assert.equal(p.version,1);assert.equal(p.monthly.length,22788);assert.equal(p.yearly.length,1880);
for(const n of p.names){assert.equal(n.estateId,p.estateId);const {_id,estateId,revision,...r}=n;nameInput.parse(r);}
for(const r of p.monthly){const {_id,estateId,revision,...record}=r;assert.equal(estateId,p.estateId);monthlyInput.parse(record);assert.equal(_id,monthlyId(estateId,r.sourceBlockId,r.month));}
for(const r of p.yearly){const {_id,estateId,revision,year,periodLabel,...record}=r;assert.equal(estateId,p.estateId);monthlyInput.parse(record);assert.equal(Number(record.month.slice(0,4)),year);}
const sum=p.monthly.filter(r=>r.month.startsWith('2026')).reduce((a,r)=>a+(r.mt||0),0);assert.ok(Math.abs(sum-28871.27)<0.001);
if(mode==='--validate'){console.log(JSON.stringify({validated:true,names:p.names.length,monthly:p.monthly.length,yearly:p.yearly.length,mt2026:sum}));process.exit(0);}
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try{
  const estate=await models.Estate.findById(p.estateId).lean();assert.equal(estate?.name,'Oban Nigeria');
  const boundaryHash=()=>createHash('sha256').update(JSON.stringify(estate.boundary)).digest('hex');const before=boundaryHash();
  const blocks=await models.Block.find({estateId:p.estateId}).lean();
  const polygons=new Set(estate.boundary.features.map(f=>f.properties.blockName||f.properties.Block_No));assert.equal(polygons.size,239);
  for(const n of p.names)if(n.mapBlockCode)assert.ok(polygons.has(n.mapBlockCode),n.mapBlockCode);
  const sets=[[models.ProductionName,p.names],[models.MonthlyProduction,p.monthly],[models.YearlyProduction,p.yearly]];
  for(const [Model,rows] of sets){await Model.createIndexes();for(const r of rows)assert.equal(new Model(r).validateSync(),undefined);}
  const existing=await Promise.all(sets.map(async([Model])=>({collection:Model.collection.name,rows:await Model.find({estateId:p.estateId}).lean()})));
  if(mode!=='--apply'){console.log(JSON.stringify({mode:'dry-run',mappedPolygons:polygons.size,existing:existing.map(x=>({collection:x.collection,count:x.rows.length})),newMonthly:p.monthly.length}));}
  else{
    const dir=path.join(process.env.DATA_DIR,'production-imports');await fs.mkdir(dir,{recursive:true,mode:0o700});
    const stamp=new Date().toISOString().replaceAll(':','-');
    await fs.writeFile(path.join(dir,stamp+'-before.json'),JSON.stringify({estate,blocks,existing}),{flag:'wx',mode:0o600});
    await fs.copyFile(filename,path.join(dir,stamp+'-source.json'));await fs.chmod(path.join(dir,stamp+'-source.json'),0o600);
    const results=[];
    for(const [Model,rows] of sets){let inserted=0;for(let start=0;start<rows.length;start+=500){const result=await Model.bulkWrite(rows.slice(start,start+500).map(r=>({updateOne:{filter:{_id:r._id,estateId:p.estateId},update:{$setOnInsert:{...r,updatedBy:'owner-authorized-workbook-import'}},upsert:true}})));inserted+=result.upsertedCount;}results.push({collection:Model.collection.name,inserted,total:await Model.countDocuments({estateId:p.estateId})});}
    const after=await models.Estate.findById(p.estateId).lean();assert.equal(createHash('sha256').update(JSON.stringify(after.boundary)).digest('hex'),before);
    assert.equal(await models.Block.countDocuments({estateId:p.estateId}),blocks.length);
    console.log(JSON.stringify({mode:'applied',results,boundariesUnchanged:true,blocksUnchanged:true}));
  }
}finally{await mongoose.disconnect();}
