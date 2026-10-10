import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthlySeries,annualSeries} from './production-charts.js';
test('shared polygon components stay separate and unreceived zeros are chart gaps',()=>{
 const base={division:'RO',receiptStatus:'received',month:'2026-07'};
 const series=monthlySeries([{...base,sourceBlockId:'a',sourceBlockCode:'F08',mt:10},{...base,sourceBlockId:'b',sourceBlockCode:'F09A',mt:20},{...base,sourceBlockId:'a',sourceBlockCode:'F08',month:'2026-08',receiptStatus:'not_received',mt:0}],2026,'mt');
 assert.equal(series.length,2);assert.equal(series[0].values[6],10);assert.equal(series[1].values[6],20);assert.equal(series[0].values[7],null);
});
test('actual zero is retained and annual YTD is labelled separately',()=>{
 const series=monthlySeries([{sourceBlockId:'x',sourceBlockCode:'E4',division:'2022',month:'2025-07',receiptStatus:'received',mt:0}],2026,'mt');assert.equal(series[0].values[6],0);assert.equal(series[0].previous,true);
 const a=annualSeries([{sourceBlockId:'x',sourceBlockCode:'E4',division:'2022',year:2026,periodLabel:'Jan–Jul YTD',receiptStatus:'received',mt:10}],'mt');assert.equal(a.labels[0],'2026 YTD');assert.equal(a.series[0].values[0],10);
});
