// Division production is pooled by period; current inventory palms weight each map block once.
// Source production records remain unchanged. Missing weights invalidate the division allocation.
export function allocateProduction(records,names,blocks,mapCodes,{annual=false}={}){
  const allowed=new Set(mapCodes),nm=new Map(names.map(n=>[n._id||n.id,n]));
  const inventory=[...new Map(blocks.filter(b=>allowed.has(b.blockCode)).map(b=>[b.blockCode,b])).values()];
  const divisions=new Map(),groups=new Map(),items=[],coverage=[];
  for(const b of inventory){if(!b.division)continue;if(!divisions.has(b.division))divisions.set(b.division,[]);divisions.get(b.division).push(b);}
  for(const r of records){const division=nm.get(r.sourceBlockId)?.division;if(!division)continue;const period=annual?String(r.year):r.month,key=JSON.stringify([division,period]);if(!groups.has(key))groups.set(key,{division,period,rows:[]});groups.get(key).rows.push(r);}
  for(const {division,period,rows} of groups.values()){
    const targets=divisions.get(division)||[],missing=targets.filter(b=>!Number.isFinite(b.totalPalms)||b.totalPalms<0);
    const divisionPalms=missing.length?null:targets.reduce((n,b)=>n+b.totalPalms,0);
    const received=rows.every(r=>r.receiptStatus==='received'&&Number.isFinite(r.mt)&&r.mt>=0);
    const periods=new Set(rows.map(r=>annual?`${r.month}|${r.periodLabel}`:r.month));
    const divisionMt=received?rows.reduce((n,r)=>n+r.mt,0):null;
    const reason=!targets.length?'No mapped blocks in division':missing.length?'Division palm counts incomplete':!(divisionPalms>0)?'No positive division palm count':!received?'Division production incomplete':periods.size!==1?'Reporting periods differ':null;
    coverage.push({division,period,divisionMt,divisionPalms,missingBlocks:missing.map(b=>b.blockCode),reason});
    for(const b of targets){
      const mt=reason?null:divisionMt*b.totalPalms/divisionPalms;
      const blockRecords=rows.filter(r=>nm.get(r.sourceBlockId)?.mapBlockCode===b.blockCode);
      const recordedTotal=key=>blockRecords.length&&blockRecords.every(r=>r.receiptStatus==='received'&&Number.isFinite(r[key]))?blockRecords.reduce((n,r)=>n+r[key],0):null;
      // Preserve the period's recorded effective area, including separate source sub-blocks.
      const effectiveHa=blockRecords.length&&blockRecords.every(r=>Number.isFinite(r.effectiveHa)&&r.effectiveHa>0)?blockRecords.reduce((n,r)=>n+r.effectiveHa,0):null;
      const bunches=recordedTotal('bunches'),harvestingDays=recordedTotal('harvestingDays');
      const sourceBlockId=`palm-${b.blockCode}`,id=`${sourceBlockId}-${period}`;
      items.push({id,sourceBlockId,sourceBlockCode:b.blockCode,mapBlockCode:b.blockCode,division,month:rows[0].month,
        ...(annual?{year:Number(period),periodLabel:periods.size===1?rows[0].periodLabel:'Mixed periods'}:{}),
        bunches,harvestingDays,abw:mt!==null&&bunches>0?mt*1000/bunches:null,
        bunchesPerHa:bunches!==null&&effectiveHa>0?bunches/effectiveHa:null,bunchesPerPalm:bunches!==null&&b.totalPalms>0?bunches/b.totalPalms:null,
        receiptStatus:reason?'unavailable':'received',mt,totalPalms:b.totalPalms,palmsPerHectare:b.palmsPerHectare,
        effectiveHa,yieldAreaHa:effectiveHa,yieldPerHa:mt!==null&&effectiveHa>0?mt/effectiveHa:null,
        divisionMt,divisionPalms,tonnesPerPalm:!reason?divisionMt/divisionPalms:null,allocationBasis:'palms',allocationReason:reason});
    }
  }
  return {items,coverage};
}
