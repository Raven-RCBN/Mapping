import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createModels} from '../src/model/index.js';
import {createApp} from '../src/app.js';
import {runExtraction} from '../src/service/document-import.js';
let app,models,root;
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'document-import-'));
 await mongoose.connect('mongodb://127.0.0.1:27018/MappingTest_documents_'+Date.now());models=createModels();
 await models.Estate.create([{_id:'a',name:'A'},{_id:'b',name:'B'}]);
 await models.Block.create({_id:'block-a',estateId:'a',blockCode:'A1',plantedHectares:12});
 await fs.mkdir(path.join(root,'estates/a/documents/test'),{recursive:true});await fs.writeFile(path.join(root,'estates/a/documents/test/source.csv'),'block,area,palms\nA1,12,120\n');
 await models.DocumentImport.create({_id:'test',estateId:'a',status:'review',sheets:['Data'],title:'Survey',surveyDate:'2026-10-20',originalName:'survey.csv',extension:'csv',filePath:'estates/a/documents/test/source.csv',warnings:[]});
 await models.DocumentRow.insertMany(Array.from({length:31},(_,i)=>({_id:'row-'+i,estateId:'a',importId:'test',sequence:i+1,sheet:'Data',sourceRow:i+1,kind:'table',cells:i===0?['block','area','palms']:i===1?['A1','14','123']:['UNKNOWN','bad','15'],highlight:true})));
 app=await createApp({models,dataDir:root,origins:[],authMode:'mapping-session',authenticate:(req,res,next)=>{req.access={subject:'test',managed:true,role:'manager',estateIds:['a'],permissions:{a:{imports:req.get('X-Read-Only')?['view']:['view','add'],geospatial:req.get('X-No-Publish')?['view']:['view','add']}}};next();}});
});
after(async()=>{if(mongoose.connection.name?.startsWith('MappingTest_'))await mongoose.connection.dropDatabase();await mongoose.disconnect();await fs.rm(root,{recursive:true,force:true});});
const get=url=>request(app).get('/api'+url).set('X-Mapping-Client','1');
const post=url=>request(app).post('/api'+url).set('X-Mapping-Client','1');
test('documents enforce location and action permissions; row pagination is bounded',async()=>{
 assert.equal((await get('/document-imports?estateId=b')).status,403);
 assert.equal((await get('/document-imports/test/file?estateId=b')).status,403);
 assert.equal((await post('/document-imports/test/apply?estateId=a').set('X-Read-Only','1')).status,403);
 const a=await get('/document-imports/test/rows?estateId=a');assert.equal(a.body.items.length,25);assert.equal(a.body.next,25);
 const b=await get('/document-imports/test/rows?estateId=a&after=25');assert.equal(b.body.items.length,6);assert.equal(b.body.next,null);
 assert.equal((await get('/document-imports/test/rows?estateId=a&after=-1')).status,400);
 assert.ok((await get('/document-imports/test/file?estateId=a')).text.includes('A1'));
});
test('explicit survey mapping links only exact blocks, flags invalid measurements and is idempotent',async()=>{
 const body={sheet:'Data',skip:1,mapping:{sourceBlockCode:0,surveyAreaHa:1,totalPalms:2}};
 assert.equal((await post('/document-imports/test/geospatial?estateId=a').set('X-No-Publish','1').send(body)).status,403);
 assert.equal((await post('/document-imports/test/geospatial?estateId=a').send({...body,mapping:{estateId:0}})).status,400);
 const result=await post('/document-imports/test/geospatial?estateId=a').send(body);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.rows,30);
 const matched=await models.GeospatialRow.findOne({sourceRow:1}).lean();assert.equal(matched.mapBlockCode,'A1');assert.equal(matched.areaDifferenceHa,2);assert.equal(matched.totalPalms,123);
 const unmatched=await models.GeospatialRow.findOne({sourceRow:2}).lean();assert.equal(unmatched.mapBlockCode,null);assert.equal(unmatched.surveyAreaHa,undefined);assert.ok(unmatched.highlight);
 assert.equal((await models.Block.findById('block-a')).plantedHectares,12);
 assert.equal((await post('/document-imports/test/geospatial?estateId=a').send(body)).status,200);assert.equal(await models.GeospatialRow.countDocuments(),30);
});
test('CSV extractor preserves quoted delimiters, newlines, blanks and formula source text',async()=>{
 const input=path.join(root,'quoted.csv'),output=path.join(root,'out.ndjson');await fs.writeFile(input,'block,note,value\r\nA1,"line one\nline two, with comma",\r\nA2,formula,=1+1\r\n');
 const meta=await runExtraction(input,output,'csv');assert.equal(meta.rows,3);const rows=(await fs.readFile(output,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows[1].cells[1],'line one\nline two, with comma');assert.equal(rows[1].cells[2],'');assert.equal(rows[2].cells[2],'=1+1');
});
test('upload extracts in background, rejects unsupported files and deduplicates within estate',async()=>{
 const denied=await post('/document-imports?estateId=a').attach('file',Buffer.from('text'),'script.exe').field('surveyDate','2026-10-20');assert.equal(denied.status,400);
 const content=Buffer.from('block,area\nA1,12.5\n');
 const first=await post('/document-imports?estateId=a').attach('file',content,'sample.csv').field('surveyDate','2026-10-20');assert.equal(first.status,202,JSON.stringify(first.body));
 let job;
 for(let i=0;i<50;i++){job=await models.DocumentImport.findById(first.body._id).lean();if(['review','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(job.status,'review',job.error);assert.equal(job.rowCount,2);
 const duplicate=await post('/document-imports?estateId=a').attach('file',content,'sample.csv').field('surveyDate','2026-10-20');assert.equal(duplicate.body._id,job._id);
 assert.equal((await post(`/document-imports/${job._id}/apply?estateId=a`)).status,200);
 assert.equal((await models.DocumentImport.findById(job._id)).status,'applied');
});
test('map overlay requires map add permission and valid geographic bounds',async()=>{
 assert.equal((await post('/document-imports/test/overlay?estateId=a').send({bounds:[[0,0],[1,1]]})).status,403);
});
