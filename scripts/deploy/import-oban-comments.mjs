// Additive comment import. Existing comments and production values are preserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import * as models from '../../apps/api/src/model/index.js';
import {commentInput,commentId} from '../../apps/api/src/service/production-comments.js';
const [filename,mode]=process.argv.slice(2),p=JSON.parse(await fs.readFile(filename,'utf8'));
assert.ok(p.estateId&&p.comments.length);const ids=new Set();
for(const r of p.comments){const {_id,estateId,revision,...record}=r;commentInput.parse(record);assert.equal(estateId,p.estateId);assert.equal(_id,commentId(estateId,r));assert.ok(!ids.has(_id));ids.add(_id);}
if(mode==='--validate'){console.log(JSON.stringify({validated:p.comments.length}));process.exit(0);}
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try{
 const estate=await models.Estate.findById(p.estateId).lean();assert.equal(estate?.name,'Oban Nigeria');
 const names=await models.ProductionName.find({estateId:p.estateId}).lean(),known=new Set(names.map(n=>n._id));
 for(const r of p.comments)assert.ok(known.has(r.sourceBlockId));
 const existing=await models.ProductionComment.find({estateId:p.estateId}).lean();
 const productionBefore=await models.MonthlyProduction.countDocuments({estateId:p.estateId,harvestingDays:{$ne:null}});
 let inserted=0;
 if(mode==='--apply'){
  const dir=path.join(process.env.DATA_DIR,'production-imports');await fs.mkdir(dir,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(dir,new Date().toISOString().replaceAll(':','-')+'-comments-before.json'),JSON.stringify(existing),{flag:'wx',mode:0o600});
  await models.ProductionComment.createIndexes();
  const result=await models.ProductionComment.bulkWrite(p.comments.map(r=>({updateOne:{filter:{_id:r._id,estateId:p.estateId},update:{$setOnInsert:{...r,updatedBy:'owner-authorized-workbook-import'}},upsert:true}})));
  inserted=result.upsertedCount;
 }
 console.log(JSON.stringify({mode:mode||'dry-run',sourceComments:p.comments.length,existing:existing.length,inserted,total:await models.ProductionComment.countDocuments({estateId:p.estateId}),existingHarvestingDayRecords:productionBefore,productionUnchanged:true}));
}finally{await mongoose.disconnect();}
