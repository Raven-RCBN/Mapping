import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAllocatedBlocks} from './wage-analytics.js';
const row={mapBlockCode:'A1',division:'OP',task:'UPKEEP',activity:'WEEDING',blockHa:10,amountMinor:10000};
const days={...row,mandayUnits:5000000};
test('annual mandays join once across months and keep cost totals',()=>{
 const [block]=summarizeAllocatedBlocks([{...row,period:'2025-01'},{...row,period:'2025-02'}],[days]);
 assert.equal(block.mandays,5);assert.equal(block.amountMinor,20000);assert.equal(block.costPerMandayMinor,4000);
});
test('missing mandays do not produce a misleading cost per manday',()=>{
 const [block]=summarizeAllocatedBlocks([{...row,period:'2025-01'},{...row,activity:'OTHER',period:'2025-02'}],[days]);
 assert.equal(block.mandays,5);assert.equal(block.costPerMandayMinor,null);
 assert.equal(summarizeAllocatedBlocks([{...row,period:'2025'}],[])[0].mandays,null);
});
test('zero-cost rows with missing days do not invalidate matching paid activity',()=>{
 const [block]=summarizeAllocatedBlocks([{...row,period:'2025'},{...row,activity:'OTHER',amountMinor:0,period:'2025'}],[days]);
 assert.equal(block.costPerMandayMinor,2000);
});
