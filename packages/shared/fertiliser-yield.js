import {fertiliserAnalysis} from './hts-analysis.js';
// Compare identical mapped-block cohorts within each year. Do not impute missing records.
export function fertiliserYield(data,production,{division='',block='',product='solids'}={}){
 const years=[...new Set([...data.fertiliserSections.map(r=>r.year),...production.map(r=>r.year)])].sort((a,b)=>a-b);
 const palms=new Map((data.blockPalms||[]).map(b=>[b.blockCode,b.totalPalms]));
 const rows=years.map(year=>{
  const f=fertiliserAnalysis(data,{year,division,block,product});
  const annual=production.filter(r=>r.year===year&&r.mapBlockCode&&(!block||r.mapBlockCode===block)&&(!division||r.division===division));
  const pairs=[];
  for(const b of f.blocks){
   const rs=annual.filter(r=>r.mapBlockCode===b.mapBlockCode),p=palms.get(b.mapBlockCode);
   if(!Number.isFinite(b.quantity)||!(p>0)||!rs.length||rs.some(r=>r.receiptStatus!=='received'||!Number.isFinite(r.mt)||!(r.effectiveHa>0)))continue;
   pairs.push({kg:b.quantity,palms:p,mt:rs.reduce((n,r)=>n+r.mt,0),ha:rs.reduce((n,r)=>n+r.effectiveHa,0),partial:rs.some(r=>r.periodLabel!=='Full year')});
  }
  const sum=k=>pairs.reduce((n,r)=>n+r[k],0),partial=pairs.some(r=>r.partial);
  return {year,kgPerPalm:pairs.length?sum('kg')/sum('palms'):null,mtPerHa:pairs.length?sum('mt')/sum('ha'):null,blocks:pairs.length,excluded:f.blocks.length-pairs.length,partial};
 });
 const complete=rows.filter(r=>!r.partial&&Number.isFinite(r.kgPerPalm)&&Number.isFinite(r.mtPerHa));
 let correlation=null;
 if(complete.length>=3){const mean=k=>complete.reduce((n,r)=>n+r[k],0)/complete.length,x=mean('kgPerPalm'),y=mean('mtPerHa');let xx=0,yy=0,xy=0;for(const r of complete){const a=r.kgPerPalm-x,b=r.mtPerHa-y;xx+=a*a;yy+=b*b;xy+=a*b;}if(xx>0&&yy>0)correlation=Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));}
 return {rows,correlation,completeYears:complete.length};
}
