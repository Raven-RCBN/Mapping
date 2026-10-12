import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fertiliserAnalysis,wageAnalysis} from './hts-analysis.js';
test('shared polygon sums quantity but area once; absent years and null values stay unknown',()=>{
 const data={products:[{name:'NPK',unit:'kg'},{name:'Liquid',unit:'L'}],fertiliserSections:[{year:2024},{year:2025}],fertiliser:[
  {year:2025,division:'RO',sourceBlockCode:'F8',mapBlockCode:'F8+F9A',mapHa:10,quantities:[100,9]},
  {year:2025,division:'RO',sourceBlockCode:'F9A',mapBlockCode:'F8+F9A',mapHa:10,quantities:[50,1]},
  {year:2025,division:'RO',sourceBlockCode:'X',mapBlockCode:null,quantities:[900,2]}]};
 const a=fertiliserAnalysis(data,{year:2025,metric:'perHa'});
 assert.equal(a.quantity,150);assert.equal(a.area,10);assert.equal(a.blocks[0].value,15);assert.equal(a.unmapped.length,1);assert.equal(a.annual[0].value,null);
 assert.equal(fertiliserAnalysis(data,{year:2025,metric:'bags'}).blocks[0].value,3);
 assert.equal(fertiliserAnalysis(data,{year:2025,product:'1'}).quantity,10);
 data.fertiliser[0].quantities[0]=null;
 assert.equal(fertiliserAnalysis(data,{year:2025}).blocks[0].value,null);
});
test('wage filters retain task identity; comparison uses same payroll month and never sums rates or points',()=>{
 const rows=[{period:'2024-01',task:'A',activity:'X',amountMinor:100,manDays:2},
 {period:'2025-01',task:'A',activity:'X',amountMinor:200,manDays:4},
 {period:'2025-02',task:'A',activity:'X',amountMinor:300,manDays:6},
 {period:'2025-01',task:'B',activity:'X',amountMinor:500,manDays:1}];
 let a=wageAnalysis(rows,{year:2025,month:'2025-01',task:'A'});
 assert.equal(a.amountMinor,200);assert.equal(a.manDays,4);assert.deepEqual(a.annual.map(r=>r.amountMinor),[100,200]);
 a=wageAnalysis(rows,{year:2025});assert.equal(a.activities.length,2);assert.equal(a.amountMinor,1000);assert.equal(a.monthly[0].amountMinor,700);
 assert.equal(a.monthly[2].available,false);assert.equal('rate' in a,false);
});
