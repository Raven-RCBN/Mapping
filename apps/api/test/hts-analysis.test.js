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
 let queries=0,palmQueries=0,rainQueries=0;
 const rainfall=[{year:2021,mm:1377.2,partial:true}];
 const blockPalms=[{blockCode:"A",totalPalms:100}];
 const blockMandays=[{year:2025,mapBlockCode:'A',task:'UPKEEP',activity:'SECURITY',mandayUnits:1e6}];
 installHtsAnalysis(app,{AnnualRainfall:{find:query=>{rainQueries++;assert.deepEqual(query,{estateId:'a',active:true});return {select:()=>({sort:order=>{assert.deepEqual(order,{year:1});return {limit:n=>{assert.equal(n,501);return {lean:async()=>rainfall};}};}})};}},Estate:{exists:async()=>true},BlockManday:{find:query=>{
   queries++;assert.deepEqual(query,{estateId:'a',year:2025});
   return {select:fields=>{assert.equal(fields,'year mapBlockCode task activity mandayUnits -_id');return {limit:n=>{assert.equal(n,50001);return {lean:async()=>blockMandays};}};}};
 }},Block:{find:query=>{
   palmQueries++;assert.deepEqual(query,{estateId:'a'});
   return {select:fields=>{assert.equal(fields,'blockCode totalPalms -_id');return {limit:n=>{assert.equal(n,5001);return {lean:async()=>blockPalms};}};}};
 }}},{dataDir:dir});
 app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
 await fs.writeFile(path.join(dir,'hts-analysis/a.json'),JSON.stringify({estateId:'a',wages:[{amountMinor:123}]}));
 await fs.writeFile(path.join(dir,'hts-analysis/wrong.json'),JSON.stringify({estateId:'a'}));
 const result=(await request(app).get('/hts-analysis?estateId=a').expect(200)).body;
 assert.deepEqual(result.rainfall,rainfall);assert.equal(rainQueries,1);
 assert.equal(result.wages[0].amountMinor,123);assert.deepEqual(result.blockMandays,blockMandays);assert.deepEqual(result.blockPalms,blockPalms);
 await request(app).get('/hts-analysis?estateId=b').expect(403);
 await request(app).get('/hts-analysis?estateId=../a').expect(400);
 await request(app).get('/hts-analysis?estateId=missing').expect(404);
 await request(app).get('/hts-analysis?estateId=wrong').expect(409);
 assert.equal(queries,1);assert.equal(palmQueries,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
