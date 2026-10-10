export const monthlySeries=(rows,year,metric)=>{
  const groups=new Map();
  for(const r of rows){
    if(![String(year),String(Number(year)-1)].includes(r.month.slice(0,4)))continue;
    const key=r.sourceBlockId+'-'+r.month.slice(0,4);
    if(!groups.has(key))groups.set(key,{key,label:`${r.sourceBlockCode} · ${r.division} · ${r.month.slice(0,4)}`,previous:r.month.slice(0,4)!==String(year),values:Array(12).fill(null)});
    groups.get(key).values[Number(r.month.slice(5,7))-1]=r.receiptStatus==='received'&&Number.isFinite(r[metric])?r[metric]:null;
  }
  return [...groups.values()].sort((a,b)=>Number(a.previous)-Number(b.previous)||a.label.localeCompare(b.label));
};
export const annualSeries=(rows,metric)=>{
  const years=[...new Set(rows.map(r=>r.year))].sort((a,b)=>a-b),groups=new Map();
  for(const r of rows){
    if(!groups.has(r.sourceBlockId))groups.set(r.sourceBlockId,{key:r.sourceBlockId,label:`${r.sourceBlockCode} · ${r.division}`,values:years.map(()=>null)});
    groups.get(r.sourceBlockId).values[years.indexOf(r.year)]=r.receiptStatus==='received'&&Number.isFinite(r[metric])?r[metric]:null;
  }
  return {labels:years.map(y=>rows.some(r=>r.year===y&&r.periodLabel!=='Full year')?`${y} YTD`:String(y)),series:[...groups.values()]};
};
