import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAllocatedBlocks,analyseWageCost} from './wage-analytics.js';
import {allocateWages} from './wages.js';

test('cost summaries include all monthly/task rows and retain the single block area',()=>{
  const items=Array.from({length:30},(_,i)=>({mapBlockCode:'A1',division:'RO',blockHa:10,period:`2025-${String(i%12+1).padStart(2,'0')}`,amountMinor:100000}));
  const [block]=summarizeAllocatedBlocks(items);
  assert.equal(block.amountMinor,3000000);assert.equal(block.mapHa,10);assert.equal(block.rateMinorPerHa,300000);assert.equal(block.periods.length,12);
});
test('strict currency thresholds keep real zero and exclude missing and unmapped blocks',()=>{
  const rows=[{mapBlockCode:'A1',mapHa:10,amountMinor:10000000},{mapBlockCode:'A2',mapHa:5,amountMinor:10000001},{mapBlockCode:'A3',mapHa:2,amountMinor:0},{mapBlockCode:'OUT',mapHa:10,amountMinor:20000000}];
  assert.deepEqual(analyseWageCost(rows,['A1','A2','A3','A4'],{operator:'gt',threshold:'100000'}).blockCodes,['A2']);
  const below=analyseWageCost(rows,['A1','A2','A3','A4'],{operator:'lt',threshold:'100000'});
  assert.deepEqual(below.blockCodes,['A3']);assert.deepEqual(below.missingBlocks,['A4']);
  assert.deepEqual(analyseWageCost(rows,['A1'],{operator:'gt',threshold:''}).matches,[]);
});
test('analytics reconciles with the same per-source rounded allocation shown in Wages',()=>{
  const areas=[{_id:'a',mapBlockCode:'A1',division:'RO',mapHa:10},{_id:'b',mapBlockCode:'A2',division:'RO',mapHa:30}];
  const wages=[{division:'RO',period:'2025-01',task:'HARVESTING',activity:'CUTTING',amountMinor:40000003,sourceKey:'1'},{division:'RO',period:'2025-02',task:'HARVESTING',activity:'CUTTING',amountMinor:40000001,sourceKey:'2'}];
  const blocks=summarizeAllocatedBlocks(allocateWages(wages,areas).items);
  assert.equal(blocks.reduce((n,r)=>n+r.amountMinor,0),80000004);
  for(const b of blocks)assert.equal(b.amountMinor,allocateWages(wages,areas,b.mapBlockCode).items.reduce((n,r)=>n+r.amountMinor,0));
});
