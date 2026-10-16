import {shiftMonth} from './decision-support.js';
export function predictionChart(report,production,{block='',perHa=false}={}){
 const selected=report.forecasts.filter(r=>!block||r.mapBlockCode===block);
 const ids=[...new Set(selected.map(r=>r.sourceBlockId))].filter(id=>[1,2,3].every(h=>selected.some(r=>r.sourceBlockId===id&&r.horizon===h)));
 const sources=new Set(ids),valid=v=>Number.isFinite(v)&&v>=0;
 const history=[-2,-1,0].map(offset=>{
  const month=shiftMonth(report.asOf,offset),rs=production.filter(r=>r.month===month&&sources.has(r.sourceBlockId));
  const complete=ids.length>0&&rs.length===ids.length&&new Set(rs.map(r=>r.sourceBlockId)).size===ids.length&&rs.every(r=>r.receiptStatus==='received'&&valid(r.mt));
  const area=rs.length&&rs.every(r=>Number.isFinite(r.effectiveHa)&&r.effectiveHa>0)?rs.reduce((n,r)=>n+r.effectiveHa,0):null;
  return {area,month,actual:complete?rs.reduce((n,r)=>n+r.mt,0):null,model:null,baseline:null,forecast:false};
 });
 const forecast=[1,2,3].map(h=>{
  const rs=selected.filter(r=>r.horizon===h&&sources.has(r.sourceBlockId));
  const complete=ids.length>0&&rs.length===ids.length&&rs.every(r=>valid(r.predictionTonnes)&&valid(r.baselineTonnes));
  const area=rs.length&&rs.every(r=>Number.isFinite(r.effectiveHa)&&r.effectiveHa>0)?rs.reduce((n,r)=>n+r.effectiveHa,0):null;
  return {area,month:shiftMonth(report.asOf,h),forecast:true,actual:null,model:complete?rs.reduce((n,r)=>n+r.predictionTonnes,0):null,baseline:complete?rs.reduce((n,r)=>n+r.baselineTonnes,0):null,lower:complete&&rs.length===1?rs[0].lowerTonnes:null,upper:complete&&rs.length===1?rs[0].upperTonnes:null,accepted:report.horizons.find(r=>r.monthsAhead===h)?.beatsBaseline===true};
 });
 const points=[...history,...forecast].map(p=>perHa?{...p,...Object.fromEntries(['actual','model','baseline','lower','upper'].map(k=>[k,p.area>0&&Number.isFinite(p[k])?p[k]/p.area:null]))}:p);
 return {sources:ids.length,points};
}
