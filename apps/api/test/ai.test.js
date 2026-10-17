import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import {AIBudget,CAP} from '../src/service/ai/budget.js';
import {installEstateAI} from '../src/service/ai/index.js';
import {OBAN,evidenceFromRows} from '../src/service/ai/context.js';
const dir=()=>fs.mkdtemp(path.join(os.tmpdir(),'mapping-ai-test-'));
test('atomic reservations across independent workers never exceed cap',async()=>{
 const root=await dir();try{
  const workers=Array.from({length:12},()=>new AIBudget(root));await workers[0].enable(true,'admin');
  const results=await Promise.allSettled(workers.map((w,i)=>w.reserve({id:String(i),hash:'x',subject:String(i),amount:CAP/5})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal((await workers[0].status()).usedUsd,100);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('pause between reservation and dispatch refunds only unsent request',async()=>{
 const root=await dir();try{const b=new AIBudget(root);await b.enable(true,'admin');const r=await b.reserve({id:'one',hash:'x',subject:'a',amount:1000});await b.enable(false,'admin');let sent=0;await assert.rejects(b.dispatch(r.month,'one',()=>sent++),/paused/);assert.equal(sent,0);assert.equal((await b.status()).usedUsd,0);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('metered settlement, unknown retention, idempotency, rate limits and UTC rollover',async()=>{
 const root=await dir();let now=new Date('2026-10-31T23:59:59Z');try{
  const b=new AIBudget(root,()=>now);await b.enable(true,'admin');const r=await b.reserve({id:'one',hash:'x',subject:'a',amount:1000});await b.dispatch(r.month,'one',()=>{});await assert.rejects(b.reserve({id:'two',hash:'x',subject:'a',amount:1000}),/Wait/);await b.finish(r.month,'one',{cost:300,response:{answer:'cached'}});
  const retry=await b.reserve({id:'one',hash:'x',subject:'a',amount:1000});assert.equal(retry.entry.response.answer,'cached');assert.equal((await b.status()).usedUsd,300/1e9);await assert.rejects(b.reserve({id:'one',hash:'other',subject:'a',amount:1000}),/already used/);
  const u=await b.reserve({id:'unknown',hash:'x',subject:'a',amount:1000});await b.dispatch(u.month,'unknown',()=>{});await b.finish(u.month,'unknown',{});assert.equal((await b.status()).usedUsd,1300/1e9);
  const crossing=await b.reserve({id:'crossing',hash:'x',subject:'a',amount:1000});now=new Date('2026-11-01T00:00:00Z');let sent=0;await assert.rejects(b.dispatch(crossing.month,'crossing',()=>sent++),/month changed/);assert.equal(sent,0);assert.equal((await b.status()).usedUsd,0);assert.equal((await b.reserve({id:'one',hash:'x',subject:'a',amount:1000})).reused,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('missing/corrupt ledger never silently resets budget',async()=>{
 const root=await dir();try{const b=new AIBudget(root);await b.status();await fs.unlink(path.join(root,'ledger.json'));await assert.rejects(b.status(),/missing/);}finally{await fs.rm(root,{recursive:true,force:true});}
});
const evidence={estate:'OBAN',scope:'All blocks',latestProduction:'2026-07',performance:[{id:'record-1',block:'F5',status:'Review decline',changePercent:-25}],forecast:{months:[{month:'2026-08',tonnes:5252.9}],estateHistoricalWapePercent:15.26},sources:[{id:'record-1',kind:'Recorded production',date:'2026-07',block:'F5'}],allowedBlockCodes:['F5'],coverage:{rankedSourcesShown:1,eligibleSources:1}};
const fixture=async({role='admin',allowed=true,env=true,provider}={})=>{
 const root=await dir(),budget=new AIBudget(root),app=express();app.use(express.json());app.use((req,res,next)=>{req.access={subject:'test',role,estateIds:allowed?[OBAN]:[]};next();});installEstateAI(app,{}, {dataDir:root,aiBudget:budget,aiEvidence:async()=>evidence,aiEnv:env?{OPENAI_API_KEY:'not-a-real-key',OPENAI_PROJECT_ID:'test',MAPPING_AI_LIVE_ALLOWED:'true'}:{},aiFetch:provider||(()=>{throw Error('Provider must not run');})});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));return {root,budget,app};
};
const body={estateId:OBAN,action:'explain-forecast',mode:'live',requestId:'request-1234567890',question:'Explain'};
test('sample costs nothing, live fails closed, estate ACL and admin switch',async()=>{
 for(const options of [{},{role:'viewer'},{allowed:false},{env:false}]){const f=await fixture(options);try{
  const sample=await request(f.app).post('/ai/run').send({...body,mode:'sample'});assert.equal(sample.status,options.allowed===false?403:200);assert.equal((await f.budget.status()).usedUsd,0);
  const live=await request(f.app).post('/ai/run').send(body);assert.equal(live.status,options.allowed===false?403:options.env===false?503:423);
  const change=await request(f.app).patch('/ai/settings').send({estateId:OBAN,enabled:true});assert.equal(change.status,options.allowed===false||options.role==='viewer'?403:options.env===false?409:200);
  assert.equal((await request(f.app).get('/ai/status').query({estateId:'other'})).status,403);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}}
});
test('live request is bounded, no tools or retries, cached idempotent result and verified highlights',async()=>{
 let calls=0;
 const f=await fixture({provider:async(url,options)=>{calls++;const b=JSON.parse(options.body);assert.equal(b.store,false);assert.equal(b.service_tier,'default');assert.equal(b.max_output_tokens,1800);assert.equal(b.reasoning.effort,'low');assert.equal(b.text.format.type,'json_schema');assert.equal(b.text.format.strict,true);assert.equal(b.text.format.schema.additionalProperties,false);assert.deepEqual(b.text.format.schema.required,['answer','blockCodes','sourceIds','actionDrafts']);assert.match(b.input,/Return JSON/);assert.equal(b.tools,undefined);assert.equal(b.model,'gpt-6.1-sol');return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Forecast is an estimate.',blockCodes:['F5','fake'],sourceIds:['record-1','fake'],actionDrafts:[]})}]}]})};}});
 try{await f.budget.enable(true,'admin');const a=await request(f.app).post('/ai/run').send(body);assert.equal(a.status,200);assert.deepEqual(a.body.blockCodes,['F5']);assert.deepEqual(a.body.sourceIds,['record-1']);const retry=await request(f.app).post('/ai/run').send(body);assert.equal(retry.body.reused,true);assert.equal(calls,1);assert.equal((await f.budget.status()).usedUsd,(100*2500+20*10000)/1e9);}finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('provider credit failure retains reservation and cannot repeat request',async()=>{
 let calls=0;const f=await fixture({provider:async()=>{calls++;return {ok:false,status:429};}});try{await f.budget.enable(true,'admin');const a=await request(f.app).post('/ai/run').send(body);assert.equal(a.status,503);assert.match(a.body.error,/credit or rate/);assert.equal((await f.budget.status()).usedUsd,.078);assert.equal((await request(f.app).post('/ai/run').send(body)).status,409);assert.equal(calls,1);}finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('grounding uses the same baseline selection as forecast cards',()=>{
 const snapshot={status:'pilot',asOf:'2026-07',modelRevision:'test',horizons:[{monthsAhead:1,beatsBaseline:true},{monthsAhead:2,beatsBaseline:false}],forecasts:[{horizon:1,month:'2026-08',sourceBlockId:'a',predictionTonnes:10,baselineTonnes:8,effectiveHa:2},{horizon:2,month:'2026-09',sourceBlockId:'a',predictionTonnes:12,baselineTonnes:9,effectiveHa:2}]};const e=evidenceFromRows([],[],snapshot);assert.equal(e.forecast.months[0].tonnes,10);assert.equal(e.forecast.months[1].tonnes,9);assert.equal(e.forecast.months[1].tonnesPerHa,4.5);
});

test('request-format errors pause AI, expose only allowed parameter and retain charge',async()=>{
 let calls=0;const f=await fixture({provider:async()=>{calls++;return {ok:false,status:400,json:async()=>({error:{code:'unsupported_value',param:'reasoning.effort',message:'sensitive provider text'}})};}});
 try{await f.budget.enable(true,'admin');const result=await request(f.app).post('/ai/run').send(body);assert.equal(result.status,502);assert.match(result.body.error,/reasoning.effort/);assert.doesNotMatch(result.body.error,/sensitive/);assert.equal((await f.budget.status()).enabled,false);assert.equal((await f.budget.status()).usedUsd,.078);assert.equal(calls,1);}finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('Luna uses supported low effort within the same bounded text-only payload',async()=>{
 let calls=0;const f=await fixture({provider:async(url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.model,'gpt-6-luna');assert.equal(p.reasoning.effort,'low');assert.equal(p.text.format.type,'json_schema');assert.equal(p.text.format.strict,true);assert.match(p.input,/Return JSON/);assert.equal(p.max_output_tokens,1800);assert.equal(p.tools,undefined);return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Review F5 evidence.',blockCodes:['F5'],sourceIds:['record-1'],actionDrafts:[]})}]}]})};}});
 try{await f.budget.enable(true,'admin');const result=await request(f.app).post('/ai/run').send({...body,action:'ask-map'});assert.equal(result.status,200);assert.equal(calls,1);assert.equal((await f.budget.status()).usedUsd,(100*125+20*500)/1e9);}finally{await fs.rm(f.root,{recursive:true,force:true});}
});
