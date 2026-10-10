import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {createModels} from '../src/model/index.js';
import {installProduction,productionView} from '../src/service/production.js';
let m,app;
before(async()=>{
  await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_production_${Date.now()}`,{serverSelectionTimeoutMS:2500});
  m=createModels(mongoose,'ProductionTest');
  await Promise.all(Object.values(m).map(x=>x.createIndexes()));
  await m.Estate.create([{_id:'estate-a',name:'Test',boundary:{features:[{properties:{blockName:'F8+F9A'}},{properties:{blockName:'E-4'}}]}},{_id:'estate-b',name:'Other'}]);
  await m.Block.create({_id:'block-a',estateId:'estate-a',blockCode:'E-4',mapBlockNames:['E-4'],totalPalms:150,surveyDate:'2023-10-31'});
  await m.ProductionName.create([{_id:'name-a',estateId:'estate-a',sourceBlockCode:'E4',division:'2022',mapBlockCode:'E-4',linkMethod:'confirmed_alias',firstMonth:'2026-01',lastMonth:'2026-12'},
    {_id:'name-b',estateId:'estate-b',sourceBlockCode:'E4',division:'2022',mapBlockCode:null,linkMethod:'unmapped'}]);
  app=express();app.use(express.json());app.use((req,res,next)=>{req.access={subject:'test-manager',role:req.get('x-role')||'manager',estateIds:['estate-a']};next();});installProduction(app,m);app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect();}});
const record={sourceBlockId:'name-a',month:'2026-07',receiptStatus:'received',mt:6,bunches:600,workbookPalms:180,yieldAreaHa:2};
test('entry, persistence, revision conflicts, audit history and import repeatability',async()=>{
  const add=await request(app).post('/production/monthly').send({estateId:'estate-a',record}).expect(201);
  const query=await request(app).get('/production/monthly').query({estateId:'estate-a',month:'2026-07'}).expect(200);
  assert.equal(query.body.items[0].mt,6);assert.equal(query.body.items[0].palmDifference,30);assert.equal(query.body.items[0].abw,10);
  await request(app).patch('/production/monthly/'+add.body.id).send({estateId:'estate-a',revision:0,record:{...record,mt:7}}).expect(200);
  await request(app).patch('/production/monthly/'+add.body.id).send({estateId:'estate-a',revision:0,record:{...record,mt:8}}).expect(409);
  const h=await request(app).get('/production/monthly/'+add.body.id+'/history').query({estateId:'estate-a'}).expect(200);assert.equal(h.body[0].previous.mt,6);
  await request(app).post('/production/import').send({estateId:'estate-a',records:[record],preview:false}).expect(200);
  assert.equal((await m.MonthlyProduction.findById(add.body.id)).mt,7);
  await request(app).post('/production/monthly').send({estateId:'estate-a',record}).expect(409);
});
test('enforces estate permissions, write roles, known source identities and receipt semantics',async()=>{
  await request(app).get('/production/meta').query({estateId:'estate-b'}).expect(403);
  await request(app).post('/production/monthly').set('x-role','viewer').send({estateId:'estate-a',record}).expect(403);
  await request(app).post('/production/import').send({estateId:'estate-a',records:[{...record,sourceBlockId:'name-b'}],preview:false}).expect(400);
  await request(app).post('/production/monthly').send({estateId:'estate-a',record:{...record,month:'2026-08',receiptStatus:'not_received',mt:1}}).expect(400);
  await request(app).post('/production/monthly').send({estateId:'estate-a',record:{...record,month:'2026-08',receiptStatus:'not_received',mt:0,bunches:0}}).expect(201);
  const r=await request(app).get('/production/monthly').query({estateId:'estate-a',month:'2026-08'});assert.equal(r.body.items[0].abw,null);
});
test('shared polygons never create false palm differences or sum source production',()=>{
  const r=productionView({...record,mt:6},{sourceBlockCode:'F08',mapBlockCode:'F8+F9A',linkMethod:'shared_polygon'},{totalPalms:900});assert.equal(r.palmDifference,null);assert.equal(r.mt,6);
});
test('mapping changes retain history and cannot point outside the estate polygons',async()=>{
  const name={sourceBlockCode:'E4',division:'2022',mapBlockCode:'E-4',linkMethod:'confirmed_alias',firstMonth:'2026-01',lastMonth:'2026-12',note:'confirmed'};
  await request(app).patch('/production/names/name-a').send({estateId:'estate-a',revision:0,record:{...name,mapBlockCode:'unknown'}}).expect(400);
  await request(app).patch('/production/names/name-a').send({estateId:'estate-a',revision:0,record:{...name,sourceBlockCode:'NEW-E4'}}).expect(400);
  await request(app).patch('/production/names/name-a').send({estateId:'estate-a',revision:0,record:name}).expect(200);
  const n=await m.ProductionName.findById('name-a');assert.equal(n.history.length,1);
});
test('annual entry and edits remain separate from monthly records',async()=>{
  const r={...record,year:2026,periodLabel:'Jan–Jul YTD'};
  const added=await request(app).post('/production/yearly').send({estateId:'estate-a',record:r}).expect(201);
  await request(app).patch('/production/yearly/'+added.body.id).send({estateId:'estate-a',revision:0,record:{...r,month:'2026-12',periodLabel:'Full year',mt:50}}).expect(200);
  const annual=await request(app).get('/production/yearly').query({estateId:'estate-a',mapBlockCode:'E-4'}).expect(200);assert.equal(annual.body.items[0].mt,50);
  assert.equal(annual.body.items[0].month,'2026-12');assert.equal(annual.body.items[0].periodLabel,'Full year');
  assert.equal((await m.MonthlyProduction.findOne({month:'2026-07'})).mt,7);
});
