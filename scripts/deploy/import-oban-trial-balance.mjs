// Two-collection additive import. Dry run by default; never writes block/vehicle/cost ledgers.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {TB_COLLECTIONS,OBAN_TB_ESTATE_ID,hash,blockSnapshot,validateDataset} from '../../apps/api/src/service/trial-balance-data.js';
const filename=process.argv[2];assert(filename,'Provide dataset.json');
const data=JSON.parse(await fs.readFile(filename,'utf8'));
const {datasetHash,...hashable}=data;assert.equal(hash(hashable),datasetHash,'Dataset checksum changed');
const validation=validateDataset(data);
for(const source of data.sources){const bytes=await fs.readFile(path.join(path.dirname(filename),'sources',source.filename));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,`Source checksum ${source.filename}`)}
if(process.argv.includes('--validate')){console.log(JSON.stringify(validation));process.exit(0)}
const app=process.env.MAPPING_APP_ROOT||path.resolve(import.meta.dirname,'../..');
const {default:mongoose}=await import(pathToFileURL(path.join(app,'apps/api/node_modules/mongoose/index.js')));
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try{
 const db=mongoose.connection.db;assert.equal(db.databaseName,'DigitalPalmMapping');
 const scope={estateId:OBAN_TB_ESTATE_ID,year:2025},estate=await db.collection('mappingestates').findOne({_id:scope.estateId});
 assert.equal(estate?.name,'Oban Nigeria');
 const blocks=await db.collection('mappingblocks').find({estateId:scope.estateId}).toArray();
 assert.deepEqual(blockSnapshot(blocks,estate.boundary),data.masterSnapshot,'Block master/map changed: rebuild matches first');
 const guards=async()=>{
  const result={};
  for(const name of ['mappingestates','mappingblocks','mappingvehicles','mappingvehicletransactions','mappingvehicleusages']){
   const q=name==='mappingestates'?{_id:scope.estateId}:{estateId:scope.estateId};
   const docs=await db.collection(name).find(q).sort({_id:1}).toArray();result[name]={count:docs.length,hash:hash(docs)};
  }return result;
 };
 const before=await guards(),prepared={};
 for(const [kind,name]of Object.entries(TB_COLLECTIONS)){
  const incoming=data[kind].map(r=>({...r,contentHash:hash(r),datasetHash}));
  const old=await db.collection(name).find(scope).toArray(),lookup=new Map(incoming.map(r=>[r._id,r]));
  for(const doc of old){const expected=lookup.get(doc._id);assert(expected,`Unexpected existing row ${name}/${doc._id}`);
   const {createdAt,updatedAt,importState,completedAt,contentHash,datasetHash:oldHash,...sourceFields}=doc;
   assert.deepEqual(sourceFields,data[kind].find(r=>r._id===doc._id),`Existing data differs: ${name}/${doc._id}`);
   assert.equal(contentHash,expected.contentHash);assert.equal(oldHash,datasetHash);
  }
  const oldIds=new Set(old.map(r=>r._id));
  prepared[kind]={name,incoming,old,missing:incoming.filter(r=>!oldIds.has(r._id))};
 }
 const result={...validation,datasetHash,newSummary:prepared.summary.missing.length,newDetails:prepared.details.missing.length,blockMasterCount:blocks.length,vehicleRows:before.mappingvehicles.count,vehicleTransactions:before.mappingvehicletransactions.count,mode:process.argv.includes('--apply')?'apply':'dry_run'};
 if(process.argv.includes('--apply')){
  assert(process.env.DATA_DIR,'DATA_DIR is required for private backups');
  const backup=path.join(process.env.DATA_DIR,'estates',scope.estateId,'trial-balance-imports','backups',new Date().toISOString().replace(/[:.]/g,'-'));
  await fs.mkdir(backup,{recursive:true,mode:0o700});
  for(const [kind,p]of Object.entries(prepared))await fs.writeFile(path.join(backup,`${kind}.json`),JSON.stringify(p.old),{mode:0o600});
  await fs.writeFile(path.join(backup,'control.json'),JSON.stringify({before,datasetHash,sources:data.sources}),{mode:0o600});
  for(const [kind,p]of Object.entries(prepared)){
   const col=db.collection(p.name);
   await col.createIndex({estateId:1,year:1,accountKey:1,...(kind==='details'?{sourceSequence:1}:{})},{unique:true});
   if(kind==='summary')await col.createIndex({estateId:1,year:1,level1:1,level2:1,level3:1});
   else{await col.createIndex({summaryId:1,date:1});await col.createIndex({estateId:1,year:1,beigeFlag:1});await col.createIndex({estateId:1,year:1,mappedBlockIds:1});await col.createIndex({estateId:1,year:1,'reviewIssues.category':1});}
   const now=new Date();
   for(let n=0;n<p.missing.length;n+=500)await col.insertMany(p.missing.slice(n,n+500).map(r=>({...r,createdAt:now,updatedAt:now,importState:'staging'})),{ordered:true});
  }
  // Re-read every persisted field, then publish completion. Never assume insert success means reconciliation.
  for(const [kind,p]of Object.entries(prepared)){
   const actual=await db.collection(p.name).find(scope).sort({_id:1}).toArray();assert.equal(actual.length,p.incoming.length);
   const lookup=new Map(p.incoming.map(r=>[r._id,r]));
   for(const doc of actual){const {createdAt,updatedAt,importState,completedAt,...fields}=doc;assert.deepEqual(fields,lookup.get(doc._id));}
  }
  assert.deepEqual(await guards(),before,'Existing vehicle/block/map data changed during import');
  for(const p of Object.values(prepared))await db.collection(p.name).updateMany({...scope,datasetHash,importState:'staging'},{$set:{importState:'complete',completedAt:new Date()}});
  for(const p of Object.values(prepared))assert.equal(await db.collection(p.name).countDocuments({...scope,importState:'complete'}),p.incoming.length);
  result.backup=backup;result.verified=true;
 }
 console.log(JSON.stringify(result));
}finally{await mongoose.disconnect()}
