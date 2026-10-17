import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {createModels} from '../src/model/index.js';
import {installDataTablePages} from '../src/service/data-table-pages.js';
import {installVehiclePages} from '../src/service/vehicle-pages.js';
let app,m;
before(async()=>{
 await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_table_pages_${Date.now()}`,{serverSelectionTimeoutMS:2500});m=createModels(mongoose,'PageTest');
 await m.Estate.create([{_id:'estate-a',name:'A'},{_id:'estate-b',name:'B'}]);
 app=express();app.use((req,res,next)=>{req.access={subject:'test',role:'viewer',estateIds:['estate-a']};next()});installDataTablePages(app,m);installVehiclePages(app,m);app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
 const names=Array.from({length:60},(_,i)=>({_id:`source-${String(i).padStart(2,'0')}`,estateId:'estate-a',sourceBlockCode:`B${i}`,division:'D',mapBlockCode:`B${i}`,linkMethod:'code'}));
 await m.ProductionName.collection.insertMany(names);
 await m.Block.collection.insertMany(names.map((n,i)=>({_id:`block-${i}`,estateId:'estate-a',blockCode:n.mapBlockCode,totalPalms:100})));
 await m.MonthlyProduction.collection.insertMany(names.flatMap((n,i)=>[2024,2025].map(year=>({_id:`monthly-${year}-${i}`,estateId:'estate-a',sourceBlockId:n._id,month:`${year}-01`,receiptStatus:'received',mt:1,bunches:100,workbookPalms:i%2?101:100}))));
 await m.YearlyProduction.collection.insertMany(names.map((n,i)=>({_id:`yearly-${i}`,estateId:'estate-a',sourceBlockId:n._id,year:2025,month:'2025-12',receiptStatus:'received',mt:12,bunches:1200})));
 await m.WageArea.collection.insertMany(names.map((n,i)=>({_id:`area-${i}`,estateId:'estate-a',year:2025,mapBlockCode:n.mapBlockCode,sourceBlockCode:n.sourceBlockCode,division:'D',mapHa:1})));
 await m.ProductionComment.collection.insertMany(names.map((n,i)=>({_id:`comment-${i}`,estateId:'estate-a',sourceBlockId:n._id,year:2025,comment:`Note ${i}`})));
 await m.Wage.collection.insertMany(names.map((n,i)=>({_id:`wage-${i}`,sourceSystem:'test',sourceKey:`wage-${i}`,estateId:'estate-a',basis:'monthly',period:'2025-01',division:'D',task:'UPKEEP',activity:'Pruning',amountMinor:100,mapBlockCode:n.mapBlockCode})));
 await m.Vehicle.collection.insertOne({_id:'vehicle-a',estateId:'estate-a',name:'Tractor A',sourceIdentifier:'001',identityStatus:'source_identifier'});
 await m.VehicleImport.collection.insertOne({_id:'import-a',estateId:'estate-a',year:2025,status:'complete'});
 await m.VehicleTransaction.collection.insertMany(names.map((n,i)=>({_id:`vt-${String(i).padStart(2,'0')}`,estateId:'estate-a',year:2025,importId:'import-a',vehicleId:'vehicle-a',reportSequence:1,transactionSequence:i+1,date:'2025-01-01',month:'2025-01',category:'Fuel',subcategory:'Diesel',itemName:'DIESEL',quantityUnit:'L',quantity:i===0?null:2,amountMinor:100,description:'DIESEL',sourceVehicleLabel:'Tractor A',reviewFlags:[]})));
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect()}});
async function allPages(path,query){const ids=[];let cursor,count;do{const r=(await request(app).get(path).query({...query,...(cursor?{cursor}:{})}).expect(200)).body;assert(r.items.length<=25);ids.push(...r.items.map(x=>x.id));count=r.count;cursor=r.nextCursor;if(ids.length>1000)throw Error('Cursor loop')}while(cursor);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,count);return ids;}
test('production, comments and wages page all rows without crossing years or estates',async()=>{
 assert.equal((await allPages('/data-tables/monthly',{estateId:'estate-a',month:'2025-01'})).length,60);
 assert.equal((await allPages('/data-tables/yearly',{estateId:'estate-a',year:'2025'})).length,60);
 assert.equal((await allPages('/data-tables/names',{estateId:'estate-a'})).length,60);
 assert.equal((await allPages('/data-tables/areas',{estateId:'estate-a',year:'2025'})).length,60);
 assert.equal((await allPages('/data-tables/comments',{estateId:'estate-a',year:'2025'})).length,60);
 assert.equal((await allPages('/data-tables/wages',{estateId:'estate-a',year:'2025'})).length,60);
 const diff=(await request(app).get('/data-tables/monthly').query({estateId:'estate-a',month:'2025-01',match:'differences'}).expect(200)).body;assert.equal(diff.count,30);
 await request(app).get('/data-tables/monthly').query({estateId:'estate-b'}).expect(403);
 await request(app).get('/data-tables/monthly').query({estateId:'estate-a',year:'invalid'}).expect(400);
 const first=(await request(app).get('/data-tables/monthly').query({estateId:'estate-a',month:'2025-01'})).body;
 await request(app).get('/data-tables/monthly').query({estateId:'estate-a',month:'2024-01',cursor:first.nextCursor}).expect(400);
});
test('vehicle summaries and items aggregate in Mongo, raw details use cursor pages',async()=>{
 const q={estateId:'estate-a',year:2025};assert.equal((await allPages('/vehicles/page',{...q,view:'transactions'})).length,60);
 const vehicles=(await request(app).get('/vehicles/page').query({...q,view:'vehicles'}).expect(200)).body;assert.equal(vehicles.count,1);assert.equal(vehicles.items[0].name,'Tractor A');assert.equal(vehicles.items[0].runningHours,null);assert.equal(vehicles.summary.amountMinor,6000);
 const items=(await request(app).get('/vehicles/page').query({...q,view:'items'}).expect(200)).body;assert.equal(items.count,1);assert.equal(items.items[0].quantity,118);assert.equal(items.items[0].missingQuantityCount,1);
 const search=(await request(app).get('/vehicles/page').query({...q,view:'vehicles',q:'Tractor'}).expect(200)).body;assert.equal(search.count,1);
 const empty=(await request(app).get('/vehicles/page').query({...q,view:'transactions',year:2024}).expect(200)).body;assert.equal(empty.count,0);
 await request(app).get('/vehicles/page').query({...q,view:'transactions',estateId:'estate-b'}).expect(403);
});
test('deep indexed wage page examines only the requested page as year volume grows',async()=>{
 await m.Wage.init();
 for(let batch=0;batch<20;batch++)await m.Wage.collection.insertMany(Array.from({length:1000},(_,i)=>({_id:`scale-${String(batch*1000+i).padStart(6,'0')}`,sourceSystem:'scale',sourceKey:`scale-${batch*1000+i}`,estateId:'estate-a',basis:'monthly',period:'2027-01',amountMinor:100})));
 const after={$or:[{period:{$gt:'2027-01'}},{period:'2027-01',_id:{$gt:'scale-019000'}}]};
 const explain=await m.Wage.collection.find({$and:[{estateId:'estate-a',basis:'monthly',period:{$gte:'2027',$lt:'2028'}},after]}).sort({period:1,_id:1}).limit(26).hint({estateId:1,basis:1,period:1,_id:1}).explain('executionStats');
 assert.equal(explain.executionStats.nReturned,26);assert(explain.executionStats.totalDocsExamined<=30,JSON.stringify(explain.executionStats));
});
