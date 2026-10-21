import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {createModels} from '../src/model/index.js';
import {installWages,wageTotals} from '../src/service/wages.js';
let m,app,areaId,wageKey;
const record={basis:'monthly',period:'2025-01',division:'RO',task:'UPKEEP',activity:'PRUNING',sourceSerial:'7',amountMinor:10000,currency:'NGN',sourceSystem:'test',sourceKey:'cost-1'};
before(async()=>{
  await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_wages_${Date.now()}`,{serverSelectionTimeoutMS:2500});m=createModels(mongoose,'WagesTest');
  await Promise.all(Object.values(m).map(model=>model.createIndexes()));
  await m.Estate.create([{_id:'estate-a',name:'Test',currency:'NGN',boundary:{features:[{properties:{blockName:'G4'}},{properties:{blockName:'G5'}}]}},{_id:'estate-b',name:'Other'}]);
  await m.Block.create([{_id:'block-4',estateId:'estate-a',blockCode:'G4',gisAreaHa:10,division:'RO'},{_id:'block-5',estateId:'estate-a',blockCode:'G5',gisAreaHa:30,division:'RO'}]);
  app=express();app.use(express.json());app.use((req,res,next)=>{req.access={subject:'tester',role:req.get('x-role')||'manager',estateIds:['estate-a']};next();});installWages(app,m);app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect();}});
test('map areas persist once per polygon; task/activity rates and costs follow the division denominator',async()=>{
  for(const mapBlockCode of ['G4','G5']){const response=await request(app).post('/wages/areas').send({estateId:'estate-a',record:{year:2025,mapBlockCode,division:'RO',note:'Map-based'}}).expect(201);if(mapBlockCode==='G4')areaId=response.body.id;}
  await request(app).post('/wages/areas').send({estateId:'estate-a',record:{year:2025,mapBlockCode:'G4',division:'RO',note:''}}).expect(409);
  wageKey=(await request(app).post('/wages').send({estateId:'estate-a',record}).expect(201)).body.id;
  const r=await request(app).get('/wages/allocation').query({estateId:'estate-a',year:'2025',mapBlockCode:'G4'}).expect(200);
  assert.equal(r.body.amountMinor,2500);assert.equal(r.body.items[0].rateMinorPerHa,250);assert.equal(r.body.selectedAreas[0].mapHa,10);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,basis:'annual_summary',period:'2025',sourceKey:'annual',amountMinor:20000}}).expect(201);
  assert.equal((await request(app).get('/wages/allocation').query({estateId:'estate-a',year:'2025',mapBlockCode:'G4'})).body.amountMinor,2500);
});
test('preview is read-only, repeated imports preserve corrections, revision conflicts retain audit history',async()=>{
  await request(app).patch('/wages/'+wageKey).send({estateId:'estate-a',revision:0,record:{...record,amountMinor:12000}}).expect(200);
  await request(app).patch('/wages/'+wageKey).send({estateId:'estate-a',revision:0,record}).expect(409);
  const records=[record,{...record,sourceKey:'cost-2',amountMinor:500}];
  const preview=await request(app).post('/wages/import').send({estateId:'estate-a',records,preview:true}).expect(200);assert.equal(preview.body.newRecords,1);assert.equal(await m.Wage.countDocuments(),2);
  await request(app).post('/wages/import').send({estateId:'estate-a',records,preview:false}).expect(200);
  assert.equal((await m.Wage.findById(wageKey)).amountMinor,12000);
  const history=await request(app).get('/wages/'+wageKey+'/history').query({estateId:'estate-a'}).expect(200);assert.equal(history.body[0].previous.amountMinor,10000);
  await request(app).patch('/wages/'+wageKey).send({estateId:'estate-a',revision:1,record:{...record,division:'OP'}}).expect(400);
});
test('area refresh reads the map, records history, and does not change production or map data',async()=>{
  await m.Block.updateOne({_id:'block-4'},{$set:{gisAreaHa:20}});
  await request(app).patch('/wages/areas/'+areaId).send({estateId:'estate-a',revision:0,record:{division:'RO',note:'Refresh map area'}}).expect(200);
  const a=await m.WageArea.findById(areaId);assert.equal(a.mapHa,20);assert.equal(a.history[0].previous.mapHa,10);
  await request(app).patch('/wages/areas/'+areaId).send({estateId:'estate-a',revision:0,record:{division:'RO',note:''}}).expect(409);
  assert.equal(await m.MonthlyProduction.countDocuments(),0);assert.equal((await m.Block.findById('block-5')).gisAreaHa,30);
});
test('rejects cross-estate access, viewers, invalid amounts, duplicate import keys and invented map links',async()=>{
  await request(app).get('/wages').query({estateId:'estate-b',year:'2025'}).expect(403);
  await request(app).post('/wages/import').set('x-role','viewer').send({estateId:'estate-a',records:[record],preview:false}).expect(403);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,amountMinor:1.5}}).expect(400);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,sourceBlockCode:'G99',mapBlockCode:'G99'}}).expect(400);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,basis:'annual_summary',period:'2025',sourceBlockCode:'G4',mapBlockCode:'G4'}}).expect(400);
  await request(app).post('/wages/import').send({estateId:'estate-a',records:[record,record]}).expect(400);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,sourceKey:'outside',division:'MILL'}}).expect(400);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,sourceKey:'unmapped',sourceBlockCode:'NO-POLYGON'}}).expect(400);
});

test('activity breakdowns keep task identities and filtering updates block costs and rates',async()=>{
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,sourceKey:'other-task',task:'HARVESTING',activity:'PRUNING',amountMinor:6000}}).expect(201);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,sourceKey:'other-activity',activity:'WEEDING',amountMinor:3000}}).expect(201);
  const query={estateId:'estate-a',year:'2025',mapBlockCode:'G4',task:'UPKEEP',activity:'WEEDING'};
  const r=await request(app).get('/wages/allocation').query(query).expect(200);
  assert.equal(r.body.amountMinor,1200);
  assert.equal(r.body.items[0].rateMinorPerHa,60);
  assert.deepEqual(r.body.byActivity,[{task:'UPKEEP',activity:'WEEDING',amountMinor:1200}]);
  assert.equal('sources' in r.body,false);
  const source=await request(app).get('/wages').query({...query,mapBlockCode:undefined}).expect(200);
  assert.equal(source.body.amountMinor,3000);
  const meta=await request(app).get('/wages/meta').query({estateId:'estate-a',year:'2025',task:'HARVESTING'}).expect(200);
  assert.deepEqual(meta.body.activities,['PRUNING']);
  const totals=wageTotals([{task:'UPKEEP',activity:'PRUNING',amountMinor:10},{task:'HARVESTING',activity:'PRUNING',amountMinor:20}]);
  assert.equal(totals.byActivity.length,2);
  assert.equal(totals.byActivity.reduce((n,r)=>n+r.amountMinor,0),30);
  await request(app).post('/wages').send({estateId:'estate-a',record:{...record,sourceKey:'mill-task',task:'MILL'}}).expect(400);
});

test('block analytics covers every page, respects task/activity/year/basis and estate access',async()=>{
  const records=Array.from({length:30},(_,i)=>({...record,sourceKey:`analytics-${i}`,sourceSerial:String(i),activity:'ANALYTICS',amountMinor:10000}));
  await request(app).post('/wages/import').send({estateId:'estate-a',records,preview:false}).expect(200);
  const query={estateId:'estate-a',year:'2025',task:'UPKEEP',activity:'ANALYTICS'};
  const r=await request(app).get('/wages/allocation').query(query).expect(200);
  assert.equal(r.body.items.length,25);assert.equal(r.body.count,60);
  assert.deepEqual(r.body.byBlock.map(b=>[b.mapBlockCode,b.amountMinor,b.mapHa]),[['G4',120000,20],['G5',180000,30]]);
  assert.equal(r.body.byBlock.reduce((n,b)=>n+b.amountMinor,0),r.body.amountMinor);
  for(const b of r.body.byBlock){const selected=await request(app).get('/wages/allocation').query({...query,mapBlockCode:b.mapBlockCode}).expect(200);assert.equal(b.amountMinor,selected.body.amountMinor);}
  for(const filters of [{basis:'annual_summary'},{year:'2024'},{task:'HARVESTING'}])assert.deepEqual((await request(app).get('/wages/allocation').query({...query,...filters}).expect(200)).body.byBlock,[]);
  await request(app).get('/wages/allocation').query({...query,estateId:'estate-b'}).expect(403);
});

test('annual block mandays reach analytics without leaking another estate or year',async()=>{
  await m.BlockManday.create([
    {_id:'md-a',estateId:'estate-a',year:2025,mapBlockCode:'G4',division:'RO',task:'UPKEEP',activity:'PRUNING',mandayUnits:2000000,mapHa:20,divisionHa:50,sourceSystem:'test',sourceKey:'a'},
    {_id:'md-b',estateId:'estate-b',year:2025,mapBlockCode:'G4',division:'RO',task:'UPKEEP',activity:'PRUNING',mandayUnits:999000000,mapHa:20,divisionHa:50,sourceSystem:'test',sourceKey:'b'},
  ]);
  const r=await request(app).get('/wages/allocation').query({estateId:'estate-a',year:'2025',mapBlockCode:'G4',task:'UPKEEP',activity:'PRUNING'}).expect(200);
  assert.equal(r.body.byBlock[0].mandays,2);
  assert.equal(r.body.byBlock[0].costPerMandayMinor,r.body.byBlock[0].amountMinor/2);
});

test('timeline is scoped by block/year and does not combine annual source wages',async()=>{
 const r=await request(app).get('/wages/timeline').query({estateId:'estate-a',year:'2025',mapBlockCode:'G4'}).expect(200);
 const row=r.body.items.find(r=>r.task==='UPKEEP'&&r.activity==='PRUNING');
 assert.equal(row.mandays,2);assert.ok(row.months.every(m=>m.period.startsWith('2025-')));
 const allocation=await request(app).get('/wages/allocation').query({estateId:'estate-a',year:'2025',mapBlockCode:'G4'}).expect(200);
 assert.equal(r.body.items.reduce((n,r)=>n+r.amountMinor,0),allocation.body.amountMinor);
 await request(app).get('/wages/timeline').query({estateId:'estate-b',year:'2025',mapBlockCode:'G4'}).expect(403);
 await request(app).get('/wages/timeline').query({estateId:'estate-a',year:'2025',mapBlockCode:'FAKE'}).expect(400);
 const empty=await request(app).get('/wages/timeline').query({estateId:'estate-a',year:'2024',mapBlockCode:'G4'}).expect(200);assert.deepEqual(empty.body.items,[]);
});

test('account descriptions are estate-scoped and activities retain distinct task identities',async()=>{
 const activity='PieceRate Unit 0.21 Rate 130.00';
 await m.Wage.insertMany(['ACCOUNT-A','ACCOUNT-B'].map((task,i)=>({...record,_id:'description-wage-'+i,estateId:'estate-a',task,activity,sourceKey:'description-'+i})));
 await m.LedgerEntry.insertMany([
  {_id:'description-ledger-a',estateId:'estate-a',module:'Checkroll',accountCode:'ACCOUNT-A',account:'PRUNNING - LABOUR',sourceSystem:'description-test',sourceKey:'a'},
  {_id:'description-ledger-b',estateId:'estate-a',module:'Checkroll',accountCode:'ACCOUNT-B',account:'LOADING - TRANSPORT',sourceSystem:'description-test',sourceKey:'b'},
  {_id:'description-ledger-other',estateId:'estate-b',module:'Checkroll',accountCode:'ACCOUNT-A',account:'OTHER ESTATE PRIVATE',sourceSystem:'description-test',sourceKey:'other'},
 ]);
 const all=await request(app).get('/wages/meta').query({estateId:'estate-a',year:'2025'}).expect(200);
 assert.equal(all.body.taskDescriptions['ACCOUNT-A'],'PRUNNING - LABOUR');
 assert.equal(all.body.taskDescriptions['ACCOUNT-B'],'LOADING - TRANSPORT');
 assert.ok(!JSON.stringify(all.body).includes('OTHER ESTATE PRIVATE'));
 assert.equal(all.body.activityOptions.filter(r=>r.activity===activity).length,2);
 const selected=await request(app).get('/wages/meta').query({estateId:'estate-a',year:'2025',task:'ACCOUNT-A'}).expect(200);
 assert.deepEqual(selected.body.activityOptions,[{task:'ACCOUNT-A',activity}]);
 const costs=await request(app).get('/wages/allocation').query({estateId:'estate-a',year:'2025',task:'ACCOUNT-A',activity,mapBlockCode:'G4'}).expect(200);
 assert.equal(costs.body.amountMinor,4000);
 assert.ok(costs.body.items.every(r=>r.task==='ACCOUNT-A'&&r.activity===activity));
});
