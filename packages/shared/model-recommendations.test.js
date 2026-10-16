import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelRecommendations} from './model-recommendations.js';
const report={status:'pilot',asOf:'2026-07',horizons:[{monthsAhead:1,beatsBaseline:true,recommendedMethod:'gradient_boosting'},{monthsAhead:2,beatsBaseline:false,recommendedMethod:'seasonal_baseline'}],forecasts:[{sourceBlockId:'a',sourceBlockCode:'A',mapBlockCode:'A',horizon:1,month:'2026-08',predictionTonnes:2,upperTonnes:3,baselineTonnes:10,effectiveHa:null},{sourceBlockId:'b',mapBlockCode:'B',horizon:1,predictionTonnes:6,upperTonnes:9,baselineTonnes:12,effectiveHa:2}]};
test('stale models never issue operational crop allocation recommendations',()=>{
 const r=modelRecommendations(report,{block:'A',currentMonth:'2026-10'});assert.equal(r.stale,true);assert.equal(r.rows.length,1);assert.ok(r.recommendations.some(x=>x.id==='model-freshness'));assert.ok(!r.recommendations.some(x=>x.id.startsWith('model-crop')));assert.equal(r.summaries[0].modelTonnes,2);assert.equal(r.summaries[1].modelTonnes,null);
});
test('fresh forecasts only flag well-supported reductions on accepted horizon; missing area remains explicit',()=>{
 const r=modelRecommendations(report,{currentMonth:'2026-08'});assert.ok(r.recommendations.some(x=>x.id==='model-crop-a'));assert.ok(r.recommendations.some(x=>x.id==='model-area'));assert.ok(r.recommendations.some(x=>x.id==='model-baseline'));
 const rejected=modelRecommendations({...report,horizons:[{monthsAhead:1,beatsBaseline:false}]},{currentMonth:'2026-08'});assert.ok(!rejected.recommendations.some(x=>x.id.startsWith('model-crop')));
});
test('no model and unrepresented blocks do not invent predictions',()=>{
 assert.equal(modelRecommendations(null).rows.length,0);assert.equal(modelRecommendations(report,{block:'C'}).summaries[0].modelTonnes,null);
});
