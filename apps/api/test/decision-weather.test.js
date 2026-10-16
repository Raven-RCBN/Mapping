import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {installDecisionWeather,estateCentre} from '../src/service/decision-weather.js';
const boundary={features:[{geometry:{coordinates:[[[8,5],[9,6],[8,5]]]}}]};
function app(options){const a=express();a.use((req,res,next)=>{req.access={estateIds:['a'],role:'viewer'};next();});installDecisionWeather(a,{Estate:{findById:()=>({select:()=>({lean:async()=>({boundary})})})}},options);a.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));return a;}
test('weather authorises estate before fetch and clearly reports missing configuration',async()=>{
 let calls=0;const a=app({key:'',fetcher:()=>{calls++;}});
 await request(a).get('/decision-weather?estateId=b').expect(403);
 await request(a).get('/decision-weather?estateId=..').expect(400);
 const r=await request(a).get('/decision-weather?estateId=a').expect(200);assert.equal(r.body.status,'not_configured');assert.equal(calls,0);
});
test('forecast caches bounded response without leaking credentials; provider failures are sanitized',async()=>{
 let calls=0;const a=app({key:'secret',fetcher:async()=>{calls++;return {ok:true,json:async()=>({timezone:'Africa/Lagos',daily:{time:['2026-10-16'],precipitation_sum:[12]}})};}});
 const r=await request(a).get('/decision-weather?estateId=a').expect(200);await request(a).get('/decision-weather?estateId=a').expect(200);assert.equal(calls,1);assert.equal(r.body.days[0].rainMm,12);assert.equal(r.body.days[0].temperatureC,null);assert.ok(!JSON.stringify(r.body).includes('secret'));
 const broken=app({key:'secret',fetcher:async()=>{throw Error('secret');}});const b=await request(broken).get('/decision-weather?estateId=a').expect(502);assert.ok(!b.text.includes('secret'));
 assert.deepEqual(estateCentre(boundary),{latitude:5.5,longitude:8.5});assert.equal(estateCentre({}),null);
});
