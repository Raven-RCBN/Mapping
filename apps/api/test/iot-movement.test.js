import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installIotMovement,selectMovement} from '../src/service/iot-movement.js';
import {routePolicy} from '../src/service/menu-access.js';
const dataset={summary:{monthly_comparison:[{month:'2026-01'}]},blocks:[],contexts:[],coverage:[{work:'harvester',month:'2026-01',block:'A',unique_in_block_ha:4}],dailyCoverage:[{work:'harvester',date:'2026-01-02',block:'A',unique_in_block_ha:2}],comparison:[{month:'2026-01',iot_block:'A',iot_bunches:10}],dailyComparison:[{date:'2026-01-02',iot_block:'A',iot_bunches:3},{date:'2026-01-03',iot_block:'A',iot_bunches:7}],dailyRecords:[{work:'harvester',month:'2026-01',local_date:'2026-01-02',block:'A'},{work:'harvester',month:'2026-01',local_date:'2026-01-03',block:'A'},{work:'circle_spraying',month:'2026-01',local_date:'2026-01-02',block:'A'}]};
test('daily movement selection keeps work, block and date scoped without mixing monthly totals',()=>{
 const r=selectMovement(dataset,{work:'harvester',month:'2026-01',date:'2026-01-02',block:'A'});assert.equal(r.movements.length,1);assert.equal(r.coverage[0].unique_in_block_ha,2);assert.equal(r.comparison[0].iot_bunches,3);assert.deepEqual(r.dates,['2026-01-02','2026-01-03']);assert.equal(selectMovement(dataset,{work:'harvester',month:'2026-01',block:'B'}).movements.length,0);
});
test('private dataset access, other-estate empty state and invalid scopes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mapping-iot-test-'));
 try{
  const folder=path.join(dir,'estates','dafa','iot-movement');await fs.mkdir(path.join(folder,'layers'),{recursive:true});await fs.writeFile(path.join(folder,'index.json'),JSON.stringify(dataset));await fs.writeFile(path.join(folder,'layers','harvester-2026-01-02.json'),JSON.stringify({geometry:{type:'Polygon',coordinates:[]}}));
  const app=express();app.use((req,res,next)=>{req.access={role:'viewer',estateIds:['dafa','other']};next()});const models={Estate:{findById:id=>({select:()=>({lean:async()=>['dafa','other'].includes(id)?{_id:id}:null})})}};installIotMovement(app,models,{dataDir:dir});app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
  const r=await request(app).get('/iot-movement').query({estateId:'dafa',date:'2026-01-02'}).expect(200);assert.equal(r.body.available,true);assert.equal(r.body.movements.length,1);assert.ok(r.body.layer);assert.equal(r.headers['cache-control'],'private, no-store');
  const empty=await request(app).get('/iot-movement').query({estateId:'other'}).expect(200);assert.deepEqual(empty.body,{available:false,estateId:'other'});
  await request(app).get('/iot-movement').query({estateId:'denied'}).expect(403);
  for(const q of [{estateId:'../dafa'},{estateId:'dafa',work:'../x'},{estateId:'dafa',date:'2026-02-01'},{estateId:'dafa',month:'2026-02',date:'2026-02-31'}])await request(app).get('/iot-movement').query(q).expect(400);
  assert.deepEqual(routePolicy('GET','/iot-movement').menus,['map']);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
