import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {createModels} from '../src/model/index.js';
import {installTrialBalance} from '../src/service/trial-balance.js';
import {TB_COLLECTIONS} from '../src/service/trial-balance-data.js';
let app,db;
before(async()=>{
 await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_trial_balance_${Date.now()}`,{serverSelectionTimeoutMS:2500});
 const models=createModels(mongoose,'TBTest');db=mongoose.connection.db;
 await models.Estate.create([{_id:'oban',name:'Oban Nigeria'},{_id:'other',name:'Other estate'}]);
 app=express();app.use((req,res,next)=>{req.access={subject:'test',role:'viewer',estateIds:['oban']};next()});installTrialBalance(app,models);app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
 const rows=Array.from({length:30},(_,i)=>({_id:`row-${i}`,estateId:'oban',year:2025,importState:'complete',rowKind:'transaction',date:'2025-01-01',accountCode:i<28?'50011':'52402',sourceSequence:i+1,description:i===0?'Original H$ reference':'Wages',blockReference:i===1?'L5':null,beigeFlag:i<28,blockReviewRequired:i<2,debitMinor:100,creditMinor:0,netMinor:100,reviewIssues:i<2?[{reason:'missing block',category:'block_mapping'}]:[]}));
 await db.collection(TB_COLLECTIONS.details).insertMany([...rows,{...rows[0],_id:'opening',rowKind:'opening_balance'},{...rows[0],_id:'staging',importState:'staging'},{...rows[0],_id:'foreign',estateId:'other'}]);
 await db.collection(TB_COLLECTIONS.summary).insertOne({_id:'summary',estateId:'oban',year:2025,importState:'complete',sourceSequence:1,accountCode:'50011',hierarchyPath:['EXPENSES','ADMIN','STAFF','WAGES'],detailsStatus:'reconciled',transactionCount:30,beigeDetailCount:28,blockReviewDetailCount:2});
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect()}});
test('highlight and block filters return matching totals across pages, excluding opening/staging/foreign records',async()=>{
 const all=(await request(app).get('/trial-balance').query({estateId:'oban'}).expect(200)).body;assert.equal(all.count,30);assert.equal(all.items.length,25);assert.equal(all.summary.netMinor,3000);
 const first=(await request(app).get('/trial-balance').query({estateId:'oban',filter:'highlight'}).expect(200)).body;
 const high=(await request(app).get('/trial-balance').query({estateId:'oban',filter:'highlight',cursor:first.nextCursor}).expect(200)).body;assert.equal(high.count,28);assert.equal(high.items.length,3);assert.equal(high.summary.netMinor,2800);assert.equal(high.nextCursor,null);
 await request(app).get('/trial-balance').query({estateId:'oban',filter:'all',cursor:first.nextCursor}).expect(400);
 assert.equal(new Set([...first.items,...high.items].map(r=>r.id)).size,28);
 const block=(await request(app).get('/trial-balance').query({estateId:'oban',filter:'block_mismatch'}).expect(200)).body;assert.equal(block.count,2);assert.equal(block.summary.blockMismatchCount,2);
 const narrow=(await request(app).get('/trial-balance').query({estateId:'oban',accountCode:'52402',filter:'highlight'}).expect(200)).body;assert.equal(narrow.count,0);
});
test('scope, validation, literal text search, metadata and empty year',async()=>{
 await request(app).get('/trial-balance').query({estateId:'other'}).expect(403);await request(app).get('/trial-balance/meta').query({estateId:'other'}).expect(403);
 await request(app).get('/trial-balance').query({estateId:'oban',filter:'bad'}).expect(400);
 await request(app).get('/trial-balance').query({estateId:'oban',cursor:'invalid'}).expect(400);
 const search=(await request(app).get('/trial-balance').query({estateId:'oban',q:'H$'}).expect(200)).body;assert.equal(search.count,1);
 assert.equal((await request(app).get('/trial-balance').query({estateId:'oban',year:2024}).expect(200)).body.count,0);
 const meta=(await request(app).get('/trial-balance/meta').query({estateId:'oban'}).expect(200)).body;assert.equal(meta.summary.highlightCount,28);assert.deepEqual(meta.accounts[0].hierarchyPath,['EXPENSES','ADMIN','STAFF','WAGES']);
});
