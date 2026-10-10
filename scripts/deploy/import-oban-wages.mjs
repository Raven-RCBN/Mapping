// Private, additive import. Repeated imports preserve edits and allocation snapshots.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import * as models from '../../apps/api/src/model/index.js';
import {wageInput,wageId} from '../../apps/api/src/service/wages.js';
import {allocateWages} from '../../packages/shared/wages.js';
const [filename,mode]=process.argv.slice(2),p=JSON.parse(await fs.readFile(filename,'utf8'));
assert.equal(p.version,1);assert.equal(p.records.length,6513);assert.equal(p.areas.length,239);
const records=p.records.map(r=>({...wageInput.parse(r),_id:wageId(p.estateId,r),estateId:p.estateId,revision:0}));
assert.equal(new Set(records.map(r=>r._id)).size,records.length);
const areas=p.areas.map(a=>({...a,estateId:p.estateId,revision:0,_id:'wa-'+createHash('sha256').update(JSON.stringify([p.estateId,a.year,a.mapBlockCode])).digest('hex').slice(0,40)}));
assert.equal(new Set(areas.map(a=>a.mapBlockCode)).size,239);
for(const basis of ['monthly','annual_summary'])assert.equal(records.filter(r=>r.basis===basis).reduce((n,r)=>n+r.amountMinor,0),p.audit.amountMinor);
const allocation=allocateWages(records.filter(r=>r.basis==='monthly'),areas);
assert.equal(allocation.mappedMinor+allocation.unmappedMinor+allocation.unallocatedMinor,p.audit.amountMinor);
const summary={wages:records.length,monthly:3844,annual:2669,areas:areas.length,mappedEstimate:allocation.mappedMinor/100,unallocated:allocation.unallocatedMinor/100};
if(mode==='--validate'){console.log(JSON.stringify({validated:true,...summary}));process.exit(0);}
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try{
  const estate=await models.Estate.findById(p.estateId).lean();assert.equal(estate?.name,'Oban Nigeria');
  const polygons=new Set(estate.boundary.features.map(f=>f.properties.blockName||f.properties.Block_No));
  const blocks=await models.Block.find({estateId:p.estateId}).lean(),byCode=new Map(blocks.map(b=>[b.blockCode,b]));
  const mapHash=createHash('sha256').update(JSON.stringify(estate.boundary)).digest('hex');
  for(const a of areas){assert.ok(polygons.has(a.mapBlockCode));assert.equal(a.mapHa,byCode.get(a.mapBlockCode)?.gisAreaHa);assert.ok(a.mapHa>0);}
  const sets=[[models.Wage,records],[models.WageArea,areas]];
  for(const [Model,rows]of sets){await Model.createIndexes();for(const row of rows)assert.equal(new Model(row).validateSync(),undefined);}
  const existing=await Promise.all(sets.map(async([Model])=>({collection:Model.collection.name,rows:await Model.find({estateId:p.estateId}).lean()})));
  if(mode!=='--apply'){console.log(JSON.stringify({mode:'dry-run',...summary,existing:existing.map(e=>({collection:e.collection,count:e.rows.length}))}));}
  else{
    const dir=path.join(process.env.DATA_DIR,'wages-imports');await fs.mkdir(dir,{recursive:true,mode:0o700});const stamp=new Date().toISOString().replaceAll(':','-');
    await fs.writeFile(path.join(dir,stamp+'-before.json'),JSON.stringify({mapHash,existing}),{flag:'wx',mode:0o600});
    await fs.copyFile(filename,path.join(dir,stamp+'-source.json'));await fs.chmod(path.join(dir,stamp+'-source.json'),0o600);
    const results=[];
    for(const [Model,rows]of sets){let inserted=0;for(let i=0;i<rows.length;i+=500){const result=await Model.bulkWrite(rows.slice(i,i+500).map(row=>({updateOne:{filter:{_id:row._id,estateId:p.estateId},update:{$setOnInsert:{...row,updatedBy:'owner-authorized-wages-import'}},upsert:true}})));inserted+=result.upsertedCount;}results.push({collection:Model.collection.name,inserted,total:await Model.countDocuments({estateId:p.estateId})});}
    const estateAfter=await models.Estate.findById(p.estateId).lean();assert.equal(createHash('sha256').update(JSON.stringify(estateAfter.boundary)).digest('hex'),mapHash);
    assert.equal(await models.Block.countDocuments({estateId:p.estateId}),blocks.length);
    console.log(JSON.stringify({mode:'applied',...summary,results,boundariesUnchanged:true}));
  }
}finally{await mongoose.disconnect();}
