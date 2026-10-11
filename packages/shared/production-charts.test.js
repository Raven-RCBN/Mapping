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
test('chosen comparison year excludes other years and keeps missing months as gaps',()=>{
 const rows=[2022,2024,2025,2026].map(year=>({sourceBlockId:'x',sourceBlockCode:'D9',division:'2018',month:`${year}-01`,receiptStatus:'received',mt:year}));
 const series=monthlySeries(rows,'2026','mt','2022');
 assert.deepEqual(series.map(s=>[s.values[0],s.previous]),[[2026,false],[2022,true]]);
 assert.equal(series[0].values[1],null);
 assert.deepEqual(monthlySeries(rows,'2024','mt','').map(s=>s.values[0]),[2024]);
 assert.equal(monthlySeries(rows,'2023','mt','').length,0);
});
test('annual axes include each calendar year and preserve gaps for absent records',()=>{
 const base={sourceBlockId:'x',sourceBlockCode:'F11',division:'2017',receiptStatus:'received',periodLabel:'Full year'};
 const chart=annualSeries([{...base,year:2023,mt:10},{...base,year:2025,mt:20},{...base,year:2026,mt:5,periodLabel:'Jan–Jul YTD'}],'mt');
 assert.deepEqual(chart.labels,['2023','2024','2025','2026 YTD']);
 assert.deepEqual(chart.series[0].values,[10,null,20,5]);
 assert.deepEqual(annualSeries([],'mt'),{labels:[],series:[]});
});
