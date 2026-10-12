import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWageTimeline} from './wage-timeline.js';
const base={mapBlockCode:'A1',division:'OP',task:'UPKEEP',activity:'PRUNING',blockHa:10,amountMinor:10000,taskNumbers:['2']};
test('timeline groups all monthly sources without duplicating annual mandays',()=>{
 const rows=buildWageTimeline([{...base,period:'2025-01'},{...base,period:'2025-01',taskNumbers:['3']},{...base,period:'2025-12'}],[{...base,mandayUnits:5000000}],'2025');
 assert.equal(rows.length,1);assert.equal(rows[0].months.length,2);assert.equal(rows[0].months[0].amountMinor,20000);assert.deepEqual(rows[0].months[0].taskNumbers,['2','3']);assert.equal(rows[0].mandays,5);assert.equal(rows[0].costPerMandayMinor,6000);assert.equal(rows[0].amountMinor,30000);
});
test('zero placeholders, other years, and other tasks do not become the same activity',()=>{
 const rows=buildWageTimeline([{...base,period:'2025-01'},{...base,period:'2025-02',amountMinor:0},{...base,period:'2024-02'},{...base,period:'2025-03',task:'OTHER'}],[],'2025');
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.months.length===1&&r.mandays===null&&r.costPerMandayMinor===null));
});
