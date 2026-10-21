import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createModels} from '../src/model/index.js';
import {createApp} from '../src/app.js';
let app,models,root;
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'geo-analysis-'));
 await mongoose.connect('mongodb://127.0.0.1:27018/MappingTest_geospatial_'+Date.now());models=createModels();
 await models.Estate.create([{_id:'a',name:'A'},{_id:'b',name:'B'}]);
 await fs.mkdir(path.join(root,'estates/a/imports'),{recursive:true});await fs.writeFile(path.join(root,'estates/a/imports/report.txt'),'report-a');
 await models.GeospatialReport.create([{_id:'a-report',estateId:'a',files:[{key:'source',path:'estates/a/imports/report.txt',mime:'text/plain'}]},{_id:'b-report',estateId:'b'}]);
 await models.GeospatialRow.insertMany(Array.from({length:31},(_,i)=>({_id:'a-'+i,estateId:'a',reportId:'a-report',sourceRow:i,totalPalms:i<2?null:i,highlight:i%2===0,priority:i===4})));
 await models.GeospatialRow.create({_id:'b-row',estateId:'b',reportId:'a-report',sourceRow:0,totalPalms:999});
 app=await createApp({models,dataDir:root,origins:[],authMode:'mapping-session',authenticate:(req,res,next)=>{req.access={subject:'test',managed:true,role:'manager',estateIds:['a'],permissions:{a:req.get('X-No-Map')?{monthly:['view']}:{map:['view'],geospatial:['view'],history:['view'],harvesting:['view'],field:['view']}}};next();}});
});
after(async()=>{if(mongoose.connection.name?.startsWith('MappingTest_'))await mongoose.connection.dropDatabase();await mongoose.disconnect();await fs.rm(root,{recursive:true,force:true});});
const get=url=>request(app).get('/api'+url).set('X-Mapping-Client','1');
test('reports, rows and protected files are estate-scoped and require map permission',async()=>{
 const report=await get('/geospatial-analysis?estateId=a');assert.equal(report.status,200);assert.equal(report.body.reports.length,1);assert.equal(report.body.reports[0].files,undefined);
 for(const url of ['/geospatial-analysis?estateId=b','/geospatial-analysis/rows?estateId=b','/geospatial-analysis/file/b-report/source?estateId=b'])assert.equal((await get(url)).status,403);
 assert.equal((await get('/geospatial-analysis?estateId=a').set('X-No-Map','1')).status,403);
 assert.equal((await get('/geospatial-analysis/file/b-report/source?estateId=a')).status,404);
 assert.equal((await get('/geospatial-analysis/file/a-report/source?estateId=a')).text,'report-a');
});
test('pagination is stable, bounded and filters exclude unassessed counts without treating them as zero',async()=>{
 const first=await get('/geospatial-analysis/rows?estateId=a&reportId=a-report');assert.equal(first.body.total,31);assert.equal(first.body.items.length,25);
 const second=await get('/geospatial-analysis/rows?estateId=a&reportId=a-report&page=2');assert.equal(second.body.items.length,6);assert.ok(!first.body.items.some(a=>second.body.items.some(b=>a._id===b._id)));
 assert.equal((await get('/geospatial-analysis/rows?estateId=a&reportId=a-report&section=density')).body.total,29);
 assert.equal((await get('/geospatial-analysis/rows?estateId=a&reportId=a-report&section=priority')).body.total,1);
 assert.equal((await get('/geospatial-analysis/rows?estateId=a&reportId=a-report&section=highlight')).body.total,16);
 for(const params of ['page=0','page=-1','page=1.5','pageSize=100000','section=anything'])assert.equal((await get('/geospatial-analysis/rows?estateId=a&reportId=a-report&'+params)).status,400);
});

test('map timeline records reference-map capture and upload separately',async()=>{
 await models.Asset.create({_id:'map-source',estateId:'a',kind:'reference-image',name:'Survey map',acquiredAt:'2025-08-24',importedAt:'2026-10-20'});
 const capture=await get('/timeline?estates=a&anchor=2025-08-24&period=month');assert.equal(capture.status,200,JSON.stringify(capture.body));assert.ok(capture.body.assets.some(a=>a.id==='map-source'&&a.eventKind==='capture'&&a.eventOnly));
 const upload=await get('/timeline?estates=a&anchor=2026-10-20&period=month');assert.equal(upload.status,200,JSON.stringify(upload.body));assert.ok(upload.body.assets.some(a=>a.id==='upload-map-source'&&a.acquiredAt==='2026-10-20'&&a.eventOnly));assert.ok(!upload.body.assets.some(a=>a.id==='map-source'));
});

test('optimized overlay is authenticated, preserves original and falls back if absent',async()=>{
 const original='estates/a/imports/map.png',preview='estates/a/imports/map.preview.webp';
 await fs.writeFile(path.join(root,original),'original-image');
 await models.GeospatialReport.updateOne({_id:'a-report'},{$push:{files:{key:'map',path:original,mime:'image/png'}}});
 let response=await get('/geospatial-analysis/file/a-report/map?estateId=a&preview=1');
 assert.equal(response.status,200);assert.match(response.headers['content-type'],/image\/png/);assert.equal(response.body.toString(),'original-image');
 await fs.writeFile(path.join(root,preview),'small-preview');
 response=await get('/geospatial-analysis/file/a-report/map?estateId=a&preview=1');
 assert.equal(response.status,200);assert.match(response.headers['content-type'],/image\/webp/);assert.equal(response.body.toString(),'small-preview');
 assert.equal((await get('/geospatial-analysis/file/a-report/map?estateId=a')).body.toString(),'original-image');
 assert.equal((await get('/geospatial-analysis/file/a-report/map?estateId=b&preview=1')).status,403);
});
