import {shiftMonth} from './decision-support.js';
export function modelRecommendations(report,{block='',currentMonth=new Date().toISOString().slice(0,7)}={}){
 if(!report||report.status!=='pilot')return {stale:true,rows:[],recommendations:[],summaries:[]};
 const stale=report.asOf<shiftMonth(currentMonth,-1);
 const rows=report.forecasts.filter(r=>!block||r.mapBlockCode===block);
 const recommendations=[];
 if(stale)recommendations.push({id:'model-freshness',severity:'Data needed',title:'Update production before operational planning',detail:`The model uses production through ${report.asOf}. Import subsequent actual production and retrain before assigning workers or transport from this outlook.`,action:'Update monthly production and rerun the model.'});
 const summaries=report.horizons.map(h=>{
  const selected=rows.filter(r=>r.horizon===h.monthsAhead);
  const effectiveHa=selected.length&&new Set(selected.map(r=>r.sourceBlockId)).size===selected.length&&selected.every(r=>Number.isFinite(r.effectiveHa)&&r.effectiveHa>0)?selected.reduce((sum,r)=>sum+r.effectiveHa,0):null;
  return {effectiveHa,horizon:h.monthsAhead,month:shiftMonth(report.asOf,h.monthsAhead),sources:selected.length,modelTonnes:selected.length?selected.reduce((s,r)=>s+r.predictionTonnes,0):null,baselineTonnes:selected.length?selected.reduce((s,r)=>s+r.baselineTonnes,0):null,beatsBaseline:h.beatsBaseline,method:h.recommendedMethod};
 });
 if(report.horizons.some(h=>!h.beatsBaseline))recommendations.push({id:'model-baseline',severity:'Model validation',title:'Retain the seasonal baseline where it performs better',detail:'One or more forecast horizons did not improve held-out mean absolute error by at least 5%. Those model estimates remain experimental.',action:'Use the indicated baseline for those horizons after checking data freshness.'});
 const missingArea=rows.filter(r=>r.horizon===1&&!(r.effectiveHa>0)).length;
 if(missingArea)recommendations.push({id:'model-area',severity:'Data quality',title:'Confirm productive hectares',detail:`${missingArea} selected source records have no usable effective hectares. Tonnes are predicted; tonnes/ha is withheld for them.`,action:'Enter verified effective hectares rather than substituting mapped area.'});
 if(!stale){
  const h=report.horizons.find(h=>h.monthsAhead===1);
  if(h?.beatsBaseline)for(const r of rows.filter(r=>r.horizon===1&&r.baselineTonnes>0&&r.upperTonnes<r.baselineTonnes*.8))recommendations.push({id:`model-crop-${r.sourceBlockId}`,block:r.mapBlockCode,severity:'Planning review',title:'Review expected crop reduction',detail:`${r.sourceBlockCode}: model range for ${r.month} is below 80% of the same month last year. This does not identify the cause.`,action:'Check current crop observations, harvest completion and reporting before adjusting resources.'});
 }
 recommendations.push({id:'model-nutrients',severity:'Agronomy',title:'Validate nutrient plans with field evidence',detail:'Annual fertiliser history is a model input, not evidence that increasing a dose will improve yield.',action:'Collect application dates, nutrient quantities and soil/leaf results for agronomist review. Do not change dosage from this forecast alone.'});
 return {stale,rows,recommendations,summaries};
}
