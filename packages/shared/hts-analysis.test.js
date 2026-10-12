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

test('main map layer preserves zero/missing distinctions and carries all block values',async()=>{
 const {fertiliserMapLayer,fertiliserColour}=await import('./hts-analysis.js');
 const layer=fertiliserMapLayer({blocks:[{mapBlockCode:'A',value:0},{mapBlockCode:'B',value:100},{mapBlockCode:'C',value:null}]},{estateId:'e',year:2025,productLabel:'NPK',unit:'kg'});
 assert.equal(layer.kind,'fertiliser');assert.equal(layer.max,100);assert.equal(layer.values.A,0);
 assert.equal(fertiliserColour(layer.values.A,100),'#ffffff');assert.equal(fertiliserColour(layer.values.C,100),'#e7e9ec');
 assert.equal(fertiliserColour(layer.values.MISSING,100),'#e7e9ec');assert.equal(fertiliserColour(100,100),'#095b46');
 assert.match(layer.label,/2025/);
});

test('man-day weights allocate per activity, reconcile kobo and exclude missing weights and other years',async()=>{
 const {allocateActivityWages}=await import('./hts-analysis.js');
 const rows=[{period:'2025-03',task:'UPKEEP',activity:'SECURITY',amountMinor:101,manDays:8},
 {period:'2024-03',task:'UPKEEP',activity:'SECURITY',amountMinor:999,manDays:8},
 {period:'2025-03',task:'MILL',activity:'MILL',amountMinor:900,manDays:10},
 {period:'2025-03',task:'UPKEEP',activity:'MISSING',amountMinor:900,manDays:10}];
 const weight=(code,units)=>({year:2025,mapBlockCode:code,task:'UPKEEP',activity:'SECURITY',mandayUnits:units});
 const weights=[weight('A',1e6),weight('B',3e6),weight('A',1e6),weight('OUT',100e6),weight('ZERO',0)];
 const get=block=>allocateActivityWages(rows,weights,['A','B','ZERO'],block);
 const a=get('A'),b=get('B'),all=get('');
 assert.equal(all.rows.length,1);assert.equal(a.rows[0].amountMinor+b.rows[0].amountMinor,101);
 assert.equal(a.rows[0].manDays,2);assert.equal(b.rows[0].manDays,6);
 assert.equal(all.rows[0].amountMinor,101);assert.equal(get('OUT').rows.length,0);
 assert.equal(get('ZERO').rows.length,0);assert.equal(rows[0].amountMinor,101);
 assert.equal(wageAnalysis(a.rows,{year:2025,month:'2025-03'}).monthly[2].amountMinor,25);
 assert.equal(allocateActivityWages(rows,weights,[]).rows.length,0);
 assert.equal(allocateActivityWages(rows,[],['A']).rows.length,0);
 const other=[...weights,{...weight('A',3e6),activity:'OTHER'},{...weight('B',1e6),activity:'OTHER'}];
 const result=allocateActivityWages([...rows,{...rows[0],activity:'OTHER',amountMinor:100}],other,['A','B'],'A');
 assert.deepEqual(result.rows.map(r=>r.amountMinor),[25,75]);
});
