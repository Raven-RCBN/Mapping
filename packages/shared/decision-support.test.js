import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decisionSupport,shiftMonth,weatherGuidance} from './decision-support.js';
const row=(month,mt,extra={})=>({month,mt,sourceBlockId:'a',sourceBlockCode:'A',mapBlockCode:'A',effectiveHa:10,plantingYear:'2000',receiptStatus:'received',...extra});
test('same-month decline uses yield, excludes missing and changed areas',()=>{
 const rows=[row('2025-09',100),row('2026-09',70)];
 assert.equal(decisionSupport(rows,[],{asOf:'2026-10'}).performance[0].change,-30.000000000000004);
 assert.equal(decisionSupport([rows[0],{...rows[1],effectiveHa:20}],[],{asOf:'2026-10'}).performance[0].change,null);
 assert.equal(decisionSupport([rows[0],{...rows[1],receiptStatus:'unavailable'},row('2026-09',20,{sourceBlockId:'b'})],[],{asOf:'2026-10'}).performance.find(r=>r.sourceBlockId==='a').status,'Missing data');
});
test('forecast is future calendar months, ignores future/current incomplete records and reports partial cohort',()=>{
 const result=decisionSupport([row('2026-09',70),row('2025-10',50),row('2026-10',999),row('2027-01',999),row('2026-09',40,{sourceBlockId:'b'})],[],{asOf:'2026-10'});
 assert.equal(result.latest,'2026-09');assert.equal(result.forecast[0].mt,50);assert.equal(result.forecast[0].sources,1);assert.equal(result.forecast[0].eligible,2);assert.equal(result.forecast[1].mt,null);
 assert.equal(shiftMonth('2026-12',1),'2027-01');
});
test('duplicates are excluded and shared polygons retain source separation',()=>{
 const rows=[row('2026-09',70),row('2026-09',80),row('2026-09',90,{sourceBlockId:'b'})];
 const r=decisionSupport(rows,[],{asOf:'2026-10'});assert.equal(r.performance.length,1);assert.ok(r.alerts.some(a=>a.id==='duplicate-production'));
});
test('rainfall comparison requires observed same-month history and excludes missing readings',()=>{
 const rain=[2022,2023,2024,2025].map(year=>({year,monthly:[{month:9,mm:100,status:'recorded'}]}));
 rain.push({year:2026,monthly:[{month:9,mm:50,status:'recorded'},{month:10,mm:0,status:'not_supplied'}]});
 const r=decisionSupport([],rain,{asOf:'2026-10'});assert.equal(r.rainfall.change,-50);assert.equal(r.rainfall.years,4);
});
test('weather rules do not convert missing values into zero observations',()=>{
 assert.equal(weatherGuidance([{date:'2026-10-16',rainMm:null,windKmh:null}]).length,0);
 assert.equal(weatherGuidance([{date:'2026-10-16',rainMm:25,windKmh:10}]).length,1);
});
test('future placeholder months do not displace latest actual production',()=>{
 const result=decisionSupport([row('2026-07',70),row('2026-08',null,{receiptStatus:'not_received'}),row('2026-09',0,{receiptStatus:'not_received'})],[],{asOf:'2026-10'});
 assert.equal(result.latest,'2026-07');assert.ok(result.alerts.some(a=>a.id==='stale-2026-07'));
});
test('performance compares combined crop yield across years while preserving separate FFB quantities',()=>{
 const a=decisionSupport([row('2025-09',100,{looseFruitMt:10}),row('2026-09',100,{looseFruitMt:20})],[],{asOf:'2026-10'}).performance[0];assert.equal(a.currentYield,12);assert.equal(a.previousYield,11);assert.ok(Math.abs(a.change-100/11)<1e-9);assert.equal(a.mt,100);
});
