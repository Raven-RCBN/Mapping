// Run with the intended release's Node and private environment, on the data host.
// Requires an empty DAFA estate. Source files must already be under its own imports folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import mongoose from '../apps/api/node_modules/mongoose/index.js';
import {createModels} from '../apps/api/src/model/index.js';
const [payloadFile,dataDir]=process.argv.slice(2);
if(!payloadFile||!dataDir||!process.env.MONGODB_URI)throw Error('Supply payload, data directory and MONGODB_URI.');
const bytes=await fs.readFile(payloadFile),p=JSON.parse(bytes),digest=createHash('sha256').update(bytes).digest('hex');
if(p.estateId!=='673eebaf-1532-4590-9957-537373f1928d'||p.estateName!=='DAFA'||p.blocks.length!==39||p.rows.length!==36)throw Error('Unexpected import scope.');
const receipt=path.join(dataDir,'estates',p.estateId,'imports','dafa-20261020','receipt.json');
try{const old=JSON.parse(await fs.readFile(receipt));if(old.status==='complete'&&old.payloadSha256===digest){console.log('Already imported; no changes.');process.exit(0);}throw Error('Different import receipt already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mongoose.connect(process.env.MONGODB_URI);const models=createModels();
let estate,mutated=false;
const groups=[['Block',p.blocks],['GeospatialReport',[p.report]],['GeospatialRow',p.rows],['Asset',p.assets]];
try{
 estate=await models.Estate.findById(p.estateId).lean();if(!estate||estate.name!=='DAFA')throw Error('Existing DAFA estate not found.');
 if(estate.boundary?.features?.length)throw Error('DAFA already has map geometry; reconcile before importing.');
 for(const [name,rows] of groups){
  if(await models[name].countDocuments({estateId:p.estateId}))throw Error(`DAFA ${name} records already exist; reconcile first.`);
  for(const row of rows){if(row.estateId!==p.estateId)throw Error('Cross-estate row.');await new models[name](row).validate();}
  if(await models[name].exists({_id:{$in:rows.map(r=>r._id)}}))throw Error('Import IDs already exist.');
 }
 for(const f of p.files){
  if(!f.path.startsWith(`estates/${p.estateId}/imports/`)||f.path.includes('..'))throw Error('Unsafe source path.');
  const real=await fs.realpath(path.join(dataDir,f.path));if(!real.startsWith((await fs.realpath(dataDir))+path.sep))throw Error('Source outside data directory.');
  const content=await fs.readFile(real);if(content.length!==f.bytes||createHash('sha256').update(content).digest('hex')!==f.sha256)throw Error('Source checksum mismatch: '+f.key);
 }
 await fs.writeFile(path.join(path.dirname(receipt),'estate-before.json'),JSON.stringify(estate,null,2),{flag:'wx',mode:0o600});
 mutated=true;
 for(const [name,rows] of groups)await models[name].insertMany(rows);
 await models.Estate.updateOne({_id:p.estateId},{$set:{boundary:p.boundary,boundaryDate:'2026-10-15',totalAreaHa:p.totalAreaHa,source:'DAFA supplied PDFs; approximate label positions',gisImportId:'dafa-20261020'}});
 for(const [name,rows] of groups){const count=await models[name].countDocuments({estateId:p.estateId});if(count!==rows.length)throw Error(name+' count verification failed');}
 await fs.writeFile(receipt,JSON.stringify({status:'complete',at:new Date().toISOString(),estateId:p.estateId,payloadSha256:digest,counts:Object.fromEntries(groups.map(([name,rows])=>[name,rows.length])),files:p.files.map(f=>({path:f.path,sha256:f.sha256}))},null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'complete',estateId:p.estateId,counts:Object.fromEntries(groups.map(([name,rows])=>[name,rows.length]))}));
}catch(e){
 if(mutated){for(const [name,rows] of groups)await models[name].deleteMany({estateId:p.estateId,_id:{$in:rows.map(r=>r._id)}});await models.Estate.replaceOne({_id:p.estateId},estate,{timestamps:false});}
 throw e;
}finally{await mongoose.disconnect();}
