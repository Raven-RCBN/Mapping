import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictionChart} from './prediction-chart.js';
const report={asOf:'2026-07',horizons:[{monthsAhead:1,beatsBaseline:true}],forecasts:[1,2,3].flatMap(h=>['a','b'].map(id=>({sourceBlockId:id,mapBlockCode:id,horizon:h,predictionTonnes:10,baselineTonnes:12,lowerTonnes:3,upperTonnes:17})))};
test('history and forecast share a cohort; no zero imputation or aggregated intervals',()=>{
 const rows=['a','b'].map(sourceBlockId=>({sourceBlockId,month:'2026-07',receiptStatus:'received',mt:5}));
 const c=predictionChart(report,rows);assert.equal(c.points[0].actual,null);assert.equal(c.points[2].actual,10);assert.equal(c.points[3].model,20);assert.equal(c.points[3].lower,null);assert.equal(c.points[3].accepted,true);assert.equal(c.points[4].accepted,false);
});
test('single source keeps range; duplicate observations cannot inflate history',()=>{
 const r={sourceBlockId:'a',month:'2026-07',receiptStatus:'received',mt:5};const c=predictionChart(report,[r,r],{block:'a'});assert.equal(c.points[2].actual,null);assert.equal(c.points[3].upper,17);
});
test('no forecasts means no invented chart values',()=>{const c=predictionChart(report,[],{block:'missing'});assert.equal(c.sources,0);assert.ok(c.points.every(p=>p.actual===null&&p.model===null));});
