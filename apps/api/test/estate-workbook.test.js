import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createModels} from '../src/model/index.js';
import {createEstateTemplate,previewEstateWorkbook,installEstateWorkbook,parseValue,checkArchive} from '../src/service/estate-workbook.js';
import {installEstateRecords} from '../src/service/estate-records.js';
import {SummaryCache} from '../src/service/performance.js';
import {workbookSheets} from '../src/service/estate-workbook-schema.js';
import {menuAccess,routePolicy} from '../src/service/menu-access.js';
const access={subject:'workbook-test',role:'admin',isSuperuser:true,managed:true,estateIds:null};
let m,app,base;const folder=path.resolve('outputs/estate-workbook-test-'+Date.now());
before(async()=>{
 const uri=process.env.WORKBOOK_TEST_MONGO||'mongodb://127.0.0.1:27018';
 // Always use a fresh test-only database, even if the supplied URI has a DB name.
 await mongoose.connect(uri,{dbName:'MappingTest_workbook_'+Date.now(),serverSelectionTimeoutMS:3000});
 m=createModels(mongoose);
 await Promise.all(Object.values(m).map(x=>x.createIndexes()));
 await m.Estate.create([{_id:'estate-a',name:'Example Estate',currency:'USD',boundary:{features:[{properties:{blockName:'A1'}},{properties:{blockName:'A2'}}]}},{_id:'estate-b',name:'Other',currency:'USD'}]);
 await m.Block.create([{_id:'b1',estateId:'estate-a',blockCode:'A1',division:'D1',gisAreaHa:5,mapBlockNames:['A1']},{_id:'b2',estateId:'estate-a',blockCode:'A2',division:'D1',gisAreaHa:6,mapBlockNames:['A2']}]);
 await m.ProductionName.create([{_id:'n1',estateId:'estate-a',sourceBlockCode:'A1',division:'D1',mapBlockCode:'A1',linkMethod:'code',firstMonth:'2026-01',lastMonth:'2026-12'},{_id:'n2',estateId:'estate-a',sourceBlockCode:'A2',division:'D1',mapBlockCode:'A2',linkMethod:'code',firstMonth:'2026-01',lastMonth:'2026-12'}]);
 app=express();app.use(express.json());app.use((req,res,next)=>{req.access=req.get('x-deny')?{subject:'limited',role:'manager',managed:true,estateIds:['estate-a'],permissions:{'estate-a':{imports:['view','add'],blocks:['view']}}}:req.get('x-viewer')?{...access,role:'viewer'}:access;next();});app.use(menuAccess(m));installEstateWorkbook(app,m,{dataDir:folder});installEstateRecords(app,m,{dataDir:folder});app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
 base=(await createEstateTemplate(m,'estate-a',access)).buffer;
});
after(async()=>{if(mongoose.connection.readyState){assert.match(mongoose.connection.name,/^MappingTest_workbook_/);await mongoose.connection.dropDatabase();await mongoose.disconnect();}await fs.rm(folder,{recursive:true,force:true});});
async function workbook(edit){const b=new ExcelJS.Workbook();await b.xlsx.load(base);await edit(b);return Buffer.from(await b.xlsx.writeBuffer());}
function value(sheet,row,label,v){const col=sheet.getRow(1).values.indexOf(label);assert.ok(col>0,label);sheet.getCell(row,col).value=v;}
const activate=(b,name,row=2)=>{const s=b.getWorksheet(name);s.getCell(row,1).value='DATA';return s;};
async function preview(buffer,headers={}){let r=request(app).post('/estate-workbook/preview?estateId=estate-a');for(const [k,v]of Object.entries(headers))r=r.set(k,v);return r.attach('workbook',buffer,'test.xlsx');}
async function apply(token){return request(app).post('/estate-workbook/apply').send({estateId:'estate-a',token});}
test('template is estate-specific, has every data sheet and exactly two sample rows',async()=>{
 const b=new ExcelJS.Workbook();await b.xlsx.load(base);assert.equal(b.getWorksheet('_MapIntel').getCell('B2').value,'estate-a');
 for(const def of workbookSheets){const s=b.getWorksheet(def.name);assert.ok(s);assert.equal(s.rowCount,3);assert.equal(s.getCell('A2').value,'SAMPLE');assert.equal(s.getCell('A3').value,'SAMPLE');}
 const p=await preview(base);assert.equal(p.status,200);assert.deepEqual(p.body.errors,[]);assert.equal(p.body.samples,32);assert.equal(p.body.changes,0);
 assert.equal((await request(app).get('/estate-workbook/template?estateId=estate-a')).status,200);
});
test('every data tab round trips, repeated upload is unchanged, edits preserve map geometry and history',async()=>{
 const buf=await workbook(b=>{for(const def of workbookSheets){activate(b,def.name);activate(b,def.name,3);}});
 const p=await preview(buf);assert.deepEqual(p.body.errors,[]);assert.ok(p.body.changes>=28);
 const a=await apply(p.body.token);assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.complete,true);
 assert.equal(await m.MonthlyProduction.countDocuments({estateId:'estate-a'}),2);assert.equal(await m.VehicleUsage.countDocuments({estateId:'estate-a'}),2);assert.equal(await m.DocumentRow.countDocuments({estateId:'estate-a'}),2);
 const block=await m.Block.findById('b1').lean();assert.equal(block.gisAreaHa,5);assert.deepEqual(block.mapBlockNames,['A1']);
 const again=await preview(buf);assert.deepEqual(again.body.errors,[]);assert.equal(again.body.changes,0,JSON.stringify(again.body.summary));
 const edit=await workbook(b=>{const s=activate(b,'Monthly production');value(s,2,'FFB (tonnes)',12);});
 const p2=await preview(edit);assert.deepEqual(p2.body.errors,[]);assert.equal(p2.body.changes,1);assert.equal((await apply(p2.body.token)).status,200);
 const monthly=await m.MonthlyProduction.findOne({estateId:'estate-a',sourceBlockId:'n1'}).lean();assert.equal(monthly.mt,12);assert.equal(monthly.revision,1);assert.equal(monthly.history[0].previous.mt,10);
 const job=await m.DocumentImport.findOne({estateId:'estate-a'}).lean();assert.equal(job.status,'applied');assert.ok((await fs.stat(path.join(folder,job.filePath))).size>0);
});
test('rejects wrong estate, bad headers, invalid dates/numbers/formulas and duplicate identities',async()=>{
 await assert.rejects(()=>previewEstateWorkbook(m,'estate-b',access,base),/different estate/);
 for(const [label,v]of [['Work date','2026-02-30'],['Bunches',-1],['Bunches','1,000'],['Bunches',{formula:'1+1',result:2}]]){
  const p=await preview(await workbook(b=>{const s=activate(b,'Harvesting');value(s,2,label,v);}));assert.ok(p.body.errors.length,label);
 }
 const dup=await preview(await workbook(b=>{activate(b,'Crop receipts');const s=activate(b,'Crop receipts',3);value(s,3,'Record key','example-1');}));assert.match(dup.body.errors.map(e=>e.message).join(' '),/Duplicate/);
 const h=await preview(await workbook(b=>{b.getWorksheet('Blocks').getCell('C1').value='Wrong';}));assert.match(h.body.errors[0].message,/headers/);
});
test('permissions enforced at upload and apply; managed read access does not grant write',async()=>{
 const buf=await workbook(b=>activate(b,'Blocks'));
 const p=await preview(buf,{'x-deny':'1'});assert.ok(p.body.errors.some(e=>/permission/.test(e.message)));assert.equal(p.body.token,null);
 assert.equal((await preview(buf,{'x-viewer':'1'})).status,403);
 assert.deepEqual(routePolicy('POST','/estate-workbook/apply'),{menus:['imports'],action:'add'});
 const r=await request(app).get('/estate-workbook/template?estateId=estate-b').set('x-deny','1');assert.equal(r.status,403);
});
test('preview detects intervening edits; token is bound to user and estate and consumed once',async()=>{
 const buf=await workbook(b=>{const s=activate(b,'Blocks');value(s,2,'Total palms',800);});
 const p=await preview(buf);assert.deepEqual(p.body.errors,[]);
 await m.Block.updateOne({_id:'b1'},{$set:{totalPalms:750}});
 const a=await apply(p.body.token);assert.equal(a.status,409);assert.match(a.body.error,/changed/);
 assert.equal((await m.Block.findById('b1')).totalPalms,750);
 const p2=await preview(buf);
 assert.equal((await request(app).post('/estate-workbook/apply').send({estateId:'estate-b',token:p2.body.token})).status,409);
 assert.equal((await apply(p2.body.token)).status,200);assert.equal((await apply(p2.body.token)).status,409);
});
test('rejects external block references and summary overwrite of detailed balances',async()=>{
 const p=await preview(await workbook(b=>{const s=activate(b,'Block ledger');value(s,2,'Map block','OTHER');}));assert.match(p.body.errors[0].message,/polygon/);
 await m.TrialBalanceDetail.create({_id:'detail',estateId:'estate-a',year:2026,accountKey:'50000',sourceSequence:1,rowKind:'transaction'});
 const tb=await preview(await workbook(b=>activate(b,'Trial balance')));assert.match(tb.body.errors[0].message,/detailed/);
});
test('blank cells preserve values; parameter-only updates require monthly records',async()=>{
 const buf=await workbook(b=>{const s=activate(b,'Blocks');value(s,2,'Total palms','');value(s,2,'Soil type','Clay');});
 const p=await preview(buf);assert.deepEqual(p.body.errors,[]);await apply(p.body.token);assert.equal((await m.Block.findById('b1')).totalPalms,800);
 const missing=await preview(await workbook(b=>{const s=activate(b,'Monthly parameters');value(s,2,'Month','2030-01');}));assert.match(missing.body.errors[0].message,/existing record/);
});
test('bounds input and rejects non-workbooks',()=>{
 assert.throws(()=>checkArchive(Buffer.from('not an xlsx')),/xlsx/);
 assert.throws(()=>parseValue('2.5',{label:'Count',type:'integer'}),/whole/);
 assert.throws(()=>parseValue('not-a-number',{label:'Amount',type:'minor'}),/number/);
});
const recordUrl=(model,id)=>'/estate-records/'+model+'/'+encodeURIComponent(id);
async function getRecord(model,id){return request(app).get(recordUrl(model,id)).query({estateId:'estate-a'});}
test('existing non-workbook records can be edited and deleted with conflict checks and recovery audit',async()=>{
 await m.Block.create({_id:'legacy-block',estateId:'estate-a',blockCode:'LEGACY',soilType:'Old',mapBlockNames:[]});
 const r=await getRecord('Block','legacy-block');assert.equal(r.status,200);
 const cache=new SummaryCache();cache.set('count',123);
 const edit=await request(app).patch(recordUrl('Block','legacy-block')).send({estateId:'estate-a',stamp:r.body.stamp,values:{soilType:'Clay'}});assert.equal(edit.status,200,JSON.stringify(edit.body));assert.equal(cache.get('count'),null);
 assert.equal((await m.Block.findById('legacy-block')).soilType,'Clay');
 const stale=await request(app).delete(recordUrl('Block','legacy-block')).send({estateId:'estate-a',stamp:r.body.stamp});assert.equal(stale.status,409);
 const fresh=await getRecord('Block','legacy-block');const deleted=await request(app).delete(recordUrl('Block','legacy-block')).send({estateId:'estate-a',stamp:fresh.body.stamp});assert.equal(deleted.status,200);assert.equal(await m.Block.exists({_id:'legacy-block'}),null);
 const journals=await fs.readdir(path.join(folder,'estates/estate-a/record-history'));assert.ok(journals.length>=2);
});
test('record controls enforce estate permissions, immutable identities, linked records and verified records',async()=>{
 const r=await getRecord('Block','b1');
 const denied=await request(app).patch(recordUrl('Block','b1')).set('x-deny','1').send({estateId:'estate-a',stamp:r.body.stamp,values:{soilType:'Denied'}});assert.equal(denied.status,403);
 assert.equal((await request(app).delete(recordUrl('Block','b1')).set('x-deny','1').send({estateId:'estate-a',stamp:r.body.stamp})).status,403);
 assert.equal((await request(app).patch(recordUrl('Block','b1')).send({estateId:'estate-a',stamp:r.body.stamp,values:{blockCode:'OTHER'}})).status,400);
 const linked=await request(app).delete(recordUrl('Block','b1')).send({estateId:'estate-a',stamp:r.body.stamp});assert.equal(linked.status,409);assert.match(linked.body.error,/linked/);
 assert.equal((await request(app).get(recordUrl('Block','b1')).query({estateId:'estate-b'})).status,404);
 const activity=await m.HarvestingActivity.findOne({estateId:'estate-a'}).lean();await m.HarvestingActivity.updateOne({_id:activity._id},{$set:{status:'verified',verifiedAt:new Date().toISOString()}});
 const v=await getRecord('HarvestingActivity',activity._id);assert.equal((await request(app).delete(recordUrl('HarvestingActivity',activity._id)).send({estateId:'estate-a',stamp:v.body.stamp})).status,409);
});
test('editing imported reference rows preserves extra original columns',async()=>{
 await m.DocumentRow.create({_id:'legacy-doc-row',estateId:'estate-a',importId:'legacy-doc',cells:['a','b','c','d','e','f','KEEP7','KEEP8'],sheet:'Original',sequence:99});
 const r=await getRecord('DocumentRow','legacy-doc-row');const result=await request(app).patch(recordUrl('DocumentRow','legacy-doc-row')).send({estateId:'estate-a',stamp:r.body.stamp,values:{cell0:'Edited'}});assert.equal(result.status,200,JSON.stringify(result.body));
 assert.deepEqual((await m.DocumentRow.findById('legacy-doc-row')).cells,['Edited','b','c','d','e','f','KEEP7','KEEP8']);
});
test('vehicle expense edits and deletions reconcile import totals; trial detail changes preserve reported balances',async()=>{
 await m.VehicleImport.create({_id:'vi',estateId:'estate-a',year:2026,currency:'USD',status:'complete',sourceSystem:'legacy',company:'Test',branch:'Test',periodStart:'2026-01-01',periodEnd:'2026-12-31',amountMinor:1000,transactionCount:1,vehicleCount:1,headers:[{vehicleId:'v',amountMinor:1000,transactionCount:1}]});
 await m.VehicleTransaction.create({_id:'vt',estateId:'estate-a',vehicleId:'v',importId:'vi',year:2026,date:'2026-01-01',currency:'USD',amountMinor:1000,sourceKey:'legacy',sourceSystem:'legacy'});
 const r=await getRecord('VehicleTransaction','vt');const edit=await request(app).patch(recordUrl('VehicleTransaction','vt')).send({estateId:'estate-a',stamp:r.body.stamp,values:{amountMinor:1200}});assert.equal(edit.status,200,JSON.stringify(edit.body));assert.equal((await m.VehicleImport.findById('vi')).amountMinor,1200);
 const f=await getRecord('VehicleTransaction','vt');assert.equal((await request(app).delete(recordUrl('VehicleTransaction','vt')).send({estateId:'estate-a',stamp:f.body.stamp})).status,200);assert.equal((await m.VehicleImport.findById('vi')).transactionCount,0);
 await m.TrialBalanceDetail.updateOne({_id:'detail'},{$set:{importState:'complete',debitMinor:1000,creditMinor:0,netMinor:1000}});
 const t=await getRecord('TrialBalanceDetail','detail');const te=await request(app).patch(recordUrl('TrialBalanceDetail','detail')).send({estateId:'estate-a',stamp:t.body.stamp,values:{debitMinor:2500}});assert.equal(te.status,200,JSON.stringify(te.body));
 const summary=await m.TrialBalanceSummary.findOne({estateId:'estate-a',year:2026,accountKey:'50000'});assert.equal(summary.netMinor,10000);assert.equal(summary.detailNetMinor,2500);assert.equal(summary.reconciliationDifferenceMinor,7500);
});
