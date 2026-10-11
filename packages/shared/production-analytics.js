// Keep original source records separate, including shared map polygons.
export function analyseYield(rows, mapCodes, query) {
  const codes=new Set(mapCodes);
  const selected=rows.filter(r=>r.year===Number(query.year)&&codes.has(r.mapBlockCode));
  const eligible=selected.filter(r=>r.receiptStatus==='received'&&Number.isFinite(r.yieldPerHa)&&r.yieldPerHa>=0&&Number.isFinite(r.yieldAreaHa)&&r.yieldAreaHa>0);
  const threshold=Number(query.threshold);
  const valid=query.threshold!==''&&Number.isFinite(threshold)&&threshold>=0&&['gt','lt'].includes(query.operator);
  const matches=valid?eligible.filter(r=>query.operator==='gt'?r.yieldPerHa>threshold:r.yieldPerHa<threshold):[];
  matches.sort((a,b)=>(query.operator==='gt'?b.yieldPerHa-a.yieldPerHa:a.yieldPerHa-b.yieldPerHa)||a.mapBlockCode.localeCompare(b.mapBlockCode));
  const available=new Set(eligible.map(r=>r.mapBlockCode));
  return {matches,blockCodes:[...new Set(matches.map(r=>r.mapBlockCode))],eligibleBlocks:available.size,missingBlocks:[...codes].filter(code=>!available.has(code)),selected};
}
