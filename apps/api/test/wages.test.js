import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {createModels} from '../src/model/index.js';
import {installWages} from '../src/service/wages.js';
let m,app,areaId,wageKey;
const record={basis:'monthly',period:'2025-01',division:'RO',task:'UPKEEP',activity:'PRUNING',sourceSerial:'7',amountMinor:10000,currency:'NGN',sourceSystem:'test',sourceKey:'cost-1'};
before(async()=>{
  await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_wages_${Date.now()}`,{serverSelectionTimeoutMS:2500});m=createModels(mongoose,'WagesTest');
  await Promise.all(Object.values(m).map(model=>model.createIndexes()));
  await m.Estate.create([{_id:'estate-a',name:'Test',boundary:{features:[{properties:{blockName:'G4'}},{properties:{blockName:'G5'}}]}},{_id:'estate-b',name:'Other'}]);
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
});
