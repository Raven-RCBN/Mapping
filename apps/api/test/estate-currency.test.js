import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createModels} from '../src/model/index.js';
import {installUserAccess} from '../src/service/user-access.js';
import {installWages} from '../src/service/wages.js';
import {installVehicles} from '../src/service/vehicles.js';
import {installVehiclePages} from '../src/service/vehicle-pages.js';
import {installTrialBalance} from '../src/service/trial-balance.js';
import {sourceDetailsInput} from '../src/service/source-details.js';
let m,app,root;
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'estate-currency-'));
 await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_currency_${Date.now()}`,{serverSelectionTimeoutMS:2500});m=createModels(mongoose,'CurrencyTest');
 await m.Estate.create([{_id:'dafa',name:'DAFA',currency:'MYR',boundary:{features:[{properties:{blockName:'19-D1'}}]}},{_id:'oban',name:'OBAN',currency:'NGN'},{_id:'other',name:'Other'}]);
 app=express();app.use(express.json());app.use((req,res,next)=>{req.access=req.get('x-owner')==='0'?{role:'viewer',estateIds:['dafa'],isSuperuser:false}:{subject:'Admin',role:'admin',estateIds:null,isSuperuser:true};next()});
 installUserAccess(app,m,{dataDir:root});installWages(app,m);installVehicles(app,m);installVehiclePages(app,m);installTrialBalance(app,m);
 app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect();}await fs.rm(root,{recursive:true,force:true});});
test('DAFA financial APIs return MYR even when its money tables are empty',async()=>{
 for(const url of ['/wages/meta','/wages/allocation','/wages/timeline','/vehicles/meta','/vehicles/page','/trial-balance/meta','/trial-balance']){
  const res=await request(app).get(url).query({estateId:'dafa',year:'2025',view:'transactions',mapBlockCode:'19-D1'}).expect(200);
  assert.equal(res.body.currency,'MYR',url);
 }
});
test('setting estate currency requires superuser access, detects stale edits, and records history',async()=>{
 await request(app).patch('/user-access/locations/other/currency').set('x-owner','0').send({currency:'MYR',expectedCurrency:null}).expect(403);
 await request(app).patch('/user-access/locations/other/currency').send({currency:'MYR',expectedCurrency:null}).expect(200);
 const estate=await m.Estate.findById('other').lean();assert.equal(estate.currency,'MYR');assert.equal(estate.currencyHistory[0].previous,null);
 await request(app).patch('/user-access/locations/other/currency').send({currency:'NGN',expectedCurrency:null}).expect(409);
 await request(app).patch('/user-access/locations/other/currency').send({currency:'BAD',expectedCurrency:'MYR'}).expect(400);
});
test('costs must use configured currency and settings cannot relabel existing amounts',async()=>{
 const base={basis:'monthly',period:'2025-01',division:'D',task:'HARVESTING',activity:'Harvesting wages',sourceBlockCode:'19D1',mapBlockCode:'19-D1',amountMinor:12345,currency:'MYR',sourceSystem:'sql',sourceKey:'test'};
 await request(app).post('/wages').send({estateId:'dafa',record:{...base,currency:'NGN'}}).expect(400);
 await request(app).post('/wages').send({estateId:'dafa',record:base}).expect(201);
 const res=await request(app).get('/wages').query({estateId:'dafa',year:'2025'}).expect(200);assert.equal(res.body.currency,'MYR');assert.equal(res.body.amountMinor,12345);
 await request(app).patch('/user-access/locations/dafa/currency').send({currency:'NGN',expectedCurrency:'MYR'}).expect(409);
 assert.equal((await m.Wage.findOne({estateId:'dafa'})).amountMinor,12345);
 await m.Wage.create({_id:'bad',estateId:'dafa',...base,sourceKey:'conflicting',currency:'NGN'});
 await request(app).get('/wages').query({estateId:'dafa',year:'2025'}).expect(409);
});
test('source details preserve SQL documentation but reject pasted secret values',()=>{
 assert.equal(sourceDetailsInput.parse({extractionMethod:'SELECT * FROM General.Estate WHERE EstateID=@EstateID'}).extractionMethod.includes('@EstateID'),true);
 assert.equal(sourceDetailsInput.safeParse({connectionDetails:'password=exposed-secret'}).success,false);
 assert.equal(sourceDetailsInput.safeParse({connectionDetails:'mongodb://user:exposed-secret@localhost/db'}).success,false);
 assert.equal(sourceDetailsInput.safeParse({connectionDetails:'Credential reference IPLANT_SQL_PASSWORD in protected environment.'}).success,true);
});
