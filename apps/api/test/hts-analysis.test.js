import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installHtsAnalysis} from '../src/service/hts-analysis.js';
test('HTS snapshots require estate scope, do not expose paths, and reject mismatched estate data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hts-test-'));await fs.mkdir(path.join(dir,'hts-analysis'));
 try{
 const app=express();app.use((req,res,next)=>{req.access={estateIds:['a','missing','wrong'],role:'viewer'};next();});
 installHtsAnalysis(app,{Estate:{exists:async()=>true}},{dataDir:dir});
 app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
 await fs.writeFile(path.join(dir,'hts-analysis/a.json'),JSON.stringify({estateId:'a',wages:[{amountMinor:123}]}));
 await fs.writeFile(path.join(dir,'hts-analysis/wrong.json'),JSON.stringify({estateId:'a'}));
 assert.equal((await request(app).get('/hts-analysis?estateId=a').expect(200)).body.wages[0].amountMinor,123);
 await request(app).get('/hts-analysis?estateId=b').expect(403);
 await request(app).get('/hts-analysis?estateId=../a').expect(400);
 await request(app).get('/hts-analysis?estateId=missing').expect(404);
 await request(app).get('/hts-analysis?estateId=wrong').expect(409);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
