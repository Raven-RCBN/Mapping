import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocateMinor,allocateWages} from './wages.js';
const areas=[{_id:'a',sourceBlockCode:'G4',mapBlockCode:'G4',division:'RO',mapHa:10},{_id:'b',sourceBlockCode:'G5',mapBlockCode:'G5',division:'RO',mapHa:30}];
const wage={sourceKey:'one',sourceSerial:'7',period:'2025-01',division:'RO',task:'UPKEEP',activity:'PRUNING',amountMinor:10000};
test('each task/activity rate uses total division map hectares, with exact kobo reconciliation',()=>{
  const all=allocateWages([wage],areas);assert.equal(all.mappedMinor,10000);assert.equal(all.items.reduce((n,r)=>n+r.amountMinor,0),10000);
  const block=allocateWages([wage],areas,'G4').items[0];assert.equal(block.amountMinor,2500);assert.equal(block.rateMinorPerHa,250);assert.equal(block.blockHa,10);assert.deepEqual(block.taskNumbers,['7']);
  for(const value of [1,101,-101,0,100000000001])assert.equal(allocateMinor(value,areas).reduce((n,v)=>n+v,0),value);
});
test('missing area and non-field division costs remain unallocated; direct costs are never estimated again',()=>{
  const r=allocateWages([wage,{...wage,division:'MILL',amountMinor:300},{...wage,sourceBlockCode:'G4',amountMinor:500}],areas.map(a=>({...a,mapHa:a._id==='a'?null:a.mapHa})));
  assert.equal(r.unallocatedMinor,10300);assert.equal(r.directMinor,500);assert.equal(r.mappedMinor,0);assert.equal(r.items.length,0);
});
test('source serial numbers, months and activities remain separate in allocation results',()=>{
  const r=allocateWages([wage,{...wage,sourceKey:'two',sourceSerial:'8'},{...wage,period:'2025-02'},{...wage,activity:'WEEDING'}],areas,'G4');
  assert.equal(r.items.length,4);assert.equal(r.items.reduce((n,r)=>n+r.amountMinor,0),10000);
});
