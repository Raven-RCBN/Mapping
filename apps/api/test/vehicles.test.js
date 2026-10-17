import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {createModels} from '../src/model/index.js';
import {installVehicles} from '../src/service/vehicles.js';
import {prepareVehicleImport,importVehicleDataset,OBAN_ESTATE_ID} from '../src/service/vehicle-import.js';

// Synthetic fixed-size fixture exercises the reviewed report adapter without
// committing employee/estate transaction data to source control.
function fixture() {
  return {metadata:{company:'JB FARMS OBAN',branch:'PLANTATION',currency:'NGN',report:'Vehicle Analysis',
    report_filter_start:'2025-01-01',report_filter_end:'2025-12-31',source_sha256:'a'.repeat(64),
    source_file:'test.txt',capture_date_local:'2026-10-17',source_method:'test',
    transaction_total_ngn:23001086.5,vehicle_reported_total_ngn:23001086.5,organization:{classification_version:'test'}},
    vehicles:Array.from({length:77},(_,i)=>({vehicle_key:`v-${i}`,report_sequence:i+1,
      vehicle_label_source:`Vehicle ${i+1}`,vehicle_id_source:i===76?null:String(i).padStart(3,'0'),label_appears_truncated:i===76,
      reported_amount_ngn:i===0?23001086.5:0,
      transactions:Array.from({length:i<37?14:13},(_,j)=>({
        vehicle_key:`v-${i}`,vehicle_report_sequence:i+1,vehicle_label_source:`Vehicle ${i+1}`,vehicle_id_source:i===76?null:String(i).padStart(3,'0'),
        record_key:`v-${i}-line-${j}`,transaction_sequence:j+1,transaction_no:'SAME-NUMBER',currency:'NGN',
        transaction_date:j%2?'2025-02-01':'2025-01-01',amount_ngn:i===0?(j===0?23001000:j===1?86.5:0):0,
        transaction_type:'Inventory Requisition',expense_type:'REQUISITION',description_source:j%2?'DIESEL(2 LITRES)':'BATTERY(1 PIECES)',employee_source:'Synthetic operator',
        category:j%2?'Fuel':'Parts',subcategory:j%2?'Diesel':'Batteries',item_name:j%2?'DIESEL':'BATTERY',
        quantity_in_description:j%2?2:1,quantity_unit:j%2?'L':'piece',source_line:i*20+j,classification_rule:'test',review_flags:'',
      }))
    }))};
}
let m, app, dataset, prepared;
before(async()=>{
  await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_vehicles_${Date.now()}`,{serverSelectionTimeoutMS:2500});
  m=createModels(mongoose,'VehicleTest');
  await m.Estate.create([{_id:OBAN_ESTATE_ID,name:'Oban Nigeria'},{_id:'sg-gumut',name:'Sungai Gumut'}]);
  dataset=fixture();prepared=prepareVehicleImport(dataset,OBAN_ESTATE_ID);
  app=express();app.use((req,res,next)=>{req.access={subject:'test',role:'viewer',estateIds:[OBAN_ESTATE_ID]};next();});
  installVehicles(app,m);app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect();}});

test('OBAN-only import previews without writes and is additive/idempotent with exact kobo reconciliation',async()=>{
  await assert.rejects(importVehicleDataset(m,dataset,{estateId:'sg-gumut',apply:true}),/only to OBAN/);
  assert.equal((await importVehicleDataset(m,dataset,{estateId:OBAN_ESTATE_ID})).transactions,1038);
  assert.equal(await m.Vehicle.countDocuments(),0);
  await m.Activity.create({_id:'existing-field-work',estateId:OBAN_ESTATE_ID,note:'Preserve'});
  const first=await importVehicleDataset(m,dataset,{estateId:OBAN_ESTATE_ID,apply:true});
  assert.equal(first.amountMinor,2300108650);assert.equal(first.newTransactions,1038);
  const second=await importVehicleDataset(m,dataset,{estateId:OBAN_ESTATE_ID,apply:true});
  assert.equal(second.newTransactions,0);assert.equal(second.newVehicles,0);
  assert.equal(await m.VehicleTransaction.countDocuments(),1038);
  assert.equal(await m.Vehicle.countDocuments({estateId:'sg-gumut'}),0);
  assert.equal(await m.VehicleUsage.countDocuments(),0);
  assert.equal((await m.Activity.findById('existing-field-work')).note,'Preserve');
  assert.equal((await m.VehicleImport.findById(first.importId)).status,'complete');
  assert.equal((await m.Vehicle.findOne({sourceIdentifier:'000'})).sourceIdentifier,'000');
});
test('changed source, duplicate line keys and unreconciled amounts fail without altering the database',async()=>{
  const changed=structuredClone(dataset);changed.vehicles[0].transactions[0].description_source='Changed source';
  await assert.rejects(importVehicleDataset(m,changed,{estateId:OBAN_ESTATE_ID,apply:true}),/different OBAN/);
  const bad=structuredClone(dataset);bad.vehicles[0].transactions[0].amount_ngn+=1;
  assert.throws(()=>prepareVehicleImport(bad,OBAN_ESTATE_ID),/reconcile/);
  const duplicate=structuredClone(dataset);duplicate.vehicles[0].transactions[1].record_key=duplicate.vehicles[0].transactions[0].record_key;
  assert.throws(()=>prepareVehicleImport(duplicate,OBAN_ESTATE_ID));
  assert.equal(await m.VehicleTransaction.countDocuments(),1038);
});
test('estate scope, year/month filters, repeated transaction numbers and paging preserve detail and totals',async()=>{
  const query={estateId:OBAN_ESTATE_ID,year:2025};
  await request(app).get('/vehicles').query({...query,estateId:'sg-gumut'}).expect(403);
  await request(app).get('/vehicles/meta').query({estateId:'sg-gumut',year:2025}).expect(403);
  const metadata=(await request(app).get('/vehicles/meta').query(query).expect(200)).body;
  assert.equal(metadata.vehicles.length,77);assert.deepEqual(metadata.years,[2025]);
  const all=(await request(app).get('/vehicles').query(query).expect(200)).body;
  assert.equal(all.count,77);assert.equal(all.items.length,25);assert.equal(all.summary.amountMinor,2300108650);
  assert.equal(all.items[0].runningHours,null);assert.equal(all.items[0].distanceKm,null);
  const ids=[];let total=0;
  for(let page=0;page<4;page++)for(const row of (await request(app).get('/vehicles').query({...query,page})).body.items){ids.push(row.id);total+=row.amountMinor;}
  assert.equal(new Set(ids).size,77);assert.equal(total,2300108650);
  const vehicleId=prepared.vehicles[0]._id;
  const details=(await request(app).get('/vehicles').query({...query,vehicleId,view:'transactions'})).body;
  assert.equal(details.count,14);assert.equal(new Set(details.items.map(r=>r.transactionNo)).size,1);
  assert.equal(new Set(details.items.map(r=>r.id)).size,14);
  const diesel=(await request(app).get('/vehicles').query({...query,vehicleId,category:'Fuel',view:'items',month:'2025-02'})).body;
  assert.equal(diesel.items.length,1);assert.equal(diesel.items[0].quantityUnit,'L');assert.equal(diesel.items[0].quantity,14);
  assert.equal(diesel.summary.amountMinor,8650);
  assert.equal((await request(app).get('/vehicles').query({...query,year:2024})).body.count,0);
  await request(app).get('/vehicles').query({...query,month:'2024-01'}).expect(400);
  await request(app).get('/vehicles').query({...query,vehicleId:'missing-vehicle'}).expect(404);
  await request(app).get('/vehicles').query({...query,page:-1}).expect(400);
});
test('incomplete imports are hidden; usage preserves missing versus zero and activity-specific hours/km',async()=>{
  const query={estateId:OBAN_ESTATE_ID,year:2025};
  await m.VehicleImport.updateOne({_id:prepared.report._id},{$set:{status:'staging'}});
  assert.equal((await request(app).get('/vehicles').query(query)).body.count,0);
  await m.VehicleImport.updateOne({_id:prepared.report._id},{$set:{status:'complete'}});
  const base={estateId:OBAN_ESTATE_ID,vehicleId:prepared.vehicles[0]._id,workDate:'2025-02-02',activityDescription:'Field transport',sourceSystem:'test',sourceKey:'usage-1'};
  await assert.rejects(new m.VehicleUsage({...base}).validate(),/Supply running hours/);
  await assert.rejects(new m.VehicleUsage({...base,runningHours:-1}).validate());
  await assert.rejects(new m.VehicleUsage({...base,runningHours:1,workDate:'2025-02-30'}).validate());
  await assert.rejects(new m.VehicleUsage({...base,runningHours:1,hourMeterStart:20,hourMeterEnd:19}).validate());
  await m.VehicleUsage.create({_id:'usage-1',...base,runningHours:0,distanceKm:12.5,task:'HARVESTING'});
  const usage=(await request(app).get('/vehicles').query({...query,view:'usage'})).body;
  assert.equal(usage.count,1);assert.equal(usage.items[0].runningHours,0);assert.equal(usage.items[0].distanceKm,12.5);
  assert.equal(usage.items[0].blockCode,null);
  const totals=(await request(app).get('/vehicles').query(query)).body;
  assert.equal(totals.items[0].runningHours,0);assert.equal(totals.items[0].distanceKm,12.5);
  assert.equal(totals.summary.amountMinor,2300108650);
  assert.equal(await m.FieldActivity.countDocuments(),0);
});
