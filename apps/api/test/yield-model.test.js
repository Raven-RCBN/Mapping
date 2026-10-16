import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installYieldModel} from '../src/service/yield-model.js';
test('model snapshots require estate access and matching identity',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'yield-model-'));await fs.mkdir(path.join(dataDir,'yield-models'));
 try{
  const app=express();app.use((req,res,next)=>{req.access={estateIds:['a','b'],role:'viewer'};next();});
  installYieldModel(app,{Estate:{exists:async()=>true}},{dataDir});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  await request(app).get('/yield-model?estateId=other').expect(403);await request(app).get('/yield-model?estateId=../a').expect(400);
  assert.equal((await request(app).get('/yield-model?estateId=a').expect(200)).body.status,'unavailable');
  await fs.writeFile(path.join(dataDir,'yield-models/a.json'),JSON.stringify({estateId:'b',version:1,forecasts:[],horizons:[]}));await request(app).get('/yield-model?estateId=a').expect(409);
  await fs.writeFile(path.join(dataDir,'yield-models/a.json'),JSON.stringify({estateId:'a',version:1,status:'pilot',forecasts:[],horizons:[]}));assert.equal((await request(app).get('/yield-model?estateId=a').expect(200)).body.status,'pilot');
  const experimental={estateId:'b',version:1,status:'experimental',horizonMonths:1,forecasts:[]};
  await fs.writeFile(path.join(dataDir,'yield-models/a.experimental.json'),JSON.stringify(experimental));
  assert.equal((await request(app).get('/yield-model?estateId=a').expect(200)).body.experimental,undefined);
  experimental.estateId='a';await fs.writeFile(path.join(dataDir,'yield-models/a.experimental.json'),JSON.stringify(experimental));
  assert.equal((await request(app).get('/yield-model?estateId=a').expect(200)).body.experimental.status,'experimental');
  await fs.writeFile(path.join(dataDir,'yield-models/a.experimental.json'),'invalid json');
  assert.equal((await request(app).get('/yield-model?estateId=a').expect(200)).body.status,'pilot');
 }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});
