// Summarize the complete allocation, before detail-row pagination. Source bases
// and task/activity filters are applied by the allocation endpoint first.
export function summarizeAllocatedBlocks(items) {
  const blocks=new Map();
  for(const row of items) {
    if(!row.mapBlockCode)continue;
    if(!blocks.has(row.mapBlockCode))blocks.set(row.mapBlockCode,{
      mapBlockCode:row.mapBlockCode,division:row.division,mapHa:row.blockHa,
      amountMinor:0,periods:new Set(),
    });
    const block=blocks.get(row.mapBlockCode);
    block.amountMinor+=row.amountMinor;block.periods.add(row.period);
  }
  return [...blocks.values()].map(({periods,...block})=>({...block,
    periods:[...periods].sort(),rateMinorPerHa:block.mapHa>0?block.amountMinor/block.mapHa:null,
  })).sort((a,b)=>a.mapBlockCode.localeCompare(b.mapBlockCode,undefined,{numeric:true}));
}

export function analyseWageCost(rows,mapCodes,query) {
  const codes=new Set(mapCodes);
  const eligible=rows.filter(r=>codes.has(r.mapBlockCode)&&Number.isFinite(r.amountMinor)&&r.mapHa>0);
  const valid=String(query.threshold).trim()!==''&&Number.isFinite(Number(query.threshold))&&Number(query.threshold)>=0&&['gt','lt'].includes(query.operator);
  const thresholdMinor=Math.round(Number(query.threshold)*100);
  const matches=valid?eligible.filter(r=>query.operator==='gt'?r.amountMinor>thresholdMinor:r.amountMinor<thresholdMinor)
    .sort((a,b)=>(query.operator==='gt'?b.amountMinor-a.amountMinor:a.amountMinor-b.amountMinor)||a.mapBlockCode.localeCompare(b.mapBlockCode)):[];
  const available=new Set(eligible.map(r=>r.mapBlockCode));
  return {matches,blockCodes:matches.map(r=>r.mapBlockCode),eligibleBlocks:available.size,
    missingBlocks:[...codes].filter(code=>!available.has(code))};
}
