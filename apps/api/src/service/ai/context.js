import {productionTonnes,forecastYield} from '../../../../../packages/shared/production-tonnage.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {decisionSupport,shiftMonth} from '../../../../../packages/shared/decision-support.js';
import {modelRecommendations} from '../../../../../packages/shared/model-recommendations.js';
import {QueryError} from '../performance.js';
export const OBAN='f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae';
const round=n=>Number.isFinite(n)?Math.round(n*1000)/1000:null;
export function evidenceFromRows(items,names,snapshot,block=''){
 const byId=new Map(names.map(n=>[String(n._id),n]));
 const rows=items.map(r=>({...r,mapBlockCode:byId.get(String(r.sourceBlockId))?.mapBlockCode,sourceBlockCode:byId.get(String(r.sourceBlockId))?.sourceBlockCode}));
 const result=decisionSupport(rows,[],{block});
 const codes=[...new Set(names.map(n=>n.mapBlockCode).filter(Boolean))];
 if(block&&!codes.includes(block))throw new QueryError('Choose a mapped OBAN block.',400);
 const performance=result.performance.slice(0,12).map(r=>({id:String(r._id),sourceBlockId:r.sourceBlockId,block:r.mapBlockCode,month:r.month,tonnes:round(productionTonnes(r).totalCropMt),ffbTonnes:round(r.mt),looseFruitTonnes:round(r.looseFruitMt),effectiveHa:round(r.effectiveHa),tonnesPerHa:round(r.currentYield),changePercent:round(r.change),status:r.status}));
 const forecasts=modelRecommendations(snapshot,{block}).summaries.map(s=>({id:`forecast-${snapshot.modelRevision}-${s.horizon}`,month:s.month,tonnes:round(s.beatsBaseline?s.modelTonnes:s.baselineTonnes),method:s.method,sources:s.sources,effectiveHa:round(s.effectiveHa),tonnesPerHa:round(forecastYield(s.beatsBaseline?s.modelTonnes:s.baselineTonnes,s.effectiveHa,snapshot?.productionBasis)),allEffectiveAreaKnown:s.effectiveHa>0}));
 const sources=[...performance.map(r=>({id:r.id,kind:'Recorded production',date:r.month,block:r.block})),...forecasts.filter(f=>f.month).map(f=>({id:f.id,kind:'Forecast snapshot',date:snapshot.asOf,period:f.month}))];
 return {estate:'OBAN',scope:block||'All blocks',latestProduction:result.latest,performance,forecast:{revision:snapshot?.modelRevision,asOf:snapshot?.asOf,generatedAt:snapshot?.generatedAt,months:forecasts,estateHistoricalWapePercent:round(snapshot?.materialModel?.estateMetrics?.wapePercent),limitations:['Forecasts are estimates, not actual production.','August comparison is retrospective and does not prove consistent 2% accuracy.','Missing effective hectares prevent complete estate yield per hectare.','Decline is an association; investigate before attributing causes.']},sources,allowedBlockCodes:codes,coverage:{rankedSourcesShown:performance.length,eligibleSources:result.performance.length},instruction:'Only the ranked sources shown and forecast snapshot are provided. State this limit if the question needs other records.'};
}
export function contextProvider(models,config){return async block=>{
 const last=await models.MonthlyProduction.findOne({estateId:OBAN,receiptStatus:'received',mt:{$gte:0},month:{$lt:new Date().toISOString().slice(0,7)}}).select('month').sort({month:-1}).maxTimeMS(5000).lean();
 const [items,names,snapshot]=await Promise.all([
  last?models.MonthlyProduction.find({estateId:OBAN,month:{$gte:shiftMonth(last.month,-14),$lte:last.month}}).select('_id sourceBlockId month receiptStatus mt ffbMt looseFruitMt effectiveHa plantingYear').limit(8001).maxTimeMS(8000).lean():[],
  models.ProductionName.find({estateId:OBAN}).select('_id sourceBlockCode mapBlockCode').limit(1001).maxTimeMS(5000).lean(),
  fs.readFile(path.join(config.dataDir,'yield-models',OBAN+'.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;})
 ]);
 if(items.length>8000||names.length>1000)throw new QueryError('AI evidence selection is too large. Narrow the scope.',413);
 if(snapshot&&(snapshot.estateId!==OBAN||snapshot.version!==1))throw new QueryError('Forecast evidence could not be verified.',409);
 return evidenceFromRows(items,names,snapshot,block);
};}
