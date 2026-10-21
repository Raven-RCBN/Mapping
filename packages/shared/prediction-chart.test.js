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
test('yield uses total tonnes divided by effective hectares and scales source intervals',()=>{
 const withArea={...report,productionBasis:'ffb_plus_loose_fruit',forecasts:report.forecasts.map(r=>({...r,effectiveHa:r.sourceBlockId==='a'?2:8}))};
 const history=[{sourceBlockId:'a',month:'2026-07',receiptStatus:'received',mt:5,effectiveHa:1},{sourceBlockId:'b',month:'2026-07',receiptStatus:'received',mt:15,effectiveHa:4}];
 const c=predictionChart(withArea,history,{perHa:true});assert.equal(c.points[2].actual,4);assert.equal(c.points[3].model,2);assert.equal(c.points[3].baseline,2.4);
 const single=predictionChart(withArea,history,{block:'a',perHa:true});assert.equal(single.points[3].lower,1.5);assert.equal(single.points[3].upper,8.5);
 const missing=predictionChart(report,history,{perHa:true});assert.equal(missing.points[3].model,null);
 const partial=predictionChart(withArea,[{...history[0],effectiveHa:0},history[1]],{perHa:true});assert.equal(partial.points[2].actual,null);
});

test('observed combined yield includes loose fruit but FFB-only forecasts cannot invent it',()=>{
 const r={...report,forecasts:report.forecasts.map(r=>({...r,effectiveHa:10}))};const c=predictionChart(r,['a','b'].map(sourceBlockId=>({sourceBlockId,month:'2026-07',receiptStatus:'received',mt:10,looseFruitMt:2,effectiveHa:2})),{perHa:true});assert.equal(c.points[2].actual,6);assert.equal(c.points[3].model,null);assert.equal(c.points[3].baseline,null);
});
