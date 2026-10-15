// Keep original source records separate, including shared map polygons.
export function analyseYield(rows, mapCodes, query, plantingInventory=[]) {
  const codes=new Set(mapCodes);
  const plantingByCode=new Map(plantingInventory.map(b=>[b.mapBlockCode,String(b.plantingYear??'').trim()]));
  const requestedPlantingYear=String(query.plantingYear??'').trim();
  const cohort=new Set([...codes].filter(code=>!requestedPlantingYear||plantingByCode.get(code)===requestedPlantingYear));
  const selected=rows.filter(r=>r.year===Number(query.year)&&cohort.has(r.mapBlockCode)).map(r=>({...r,mapPlantingYear:plantingByCode.get(r.mapBlockCode)||null}));
  const eligible=selected.filter(r=>r.receiptStatus==='received'&&Number.isFinite(r.yieldPerHa)&&r.yieldPerHa>=0&&Number.isFinite(r.yieldAreaHa)&&r.yieldAreaHa>0);
  const threshold=Number(query.threshold);
  const valid=query.threshold!==''&&Number.isFinite(threshold)&&threshold>=0&&['gt','lt'].includes(query.operator);
  const matches=valid?eligible.filter(r=>query.operator==='gt'?r.yieldPerHa>threshold:r.yieldPerHa<threshold):[];
  matches.sort((a,b)=>(query.operator==='gt'?b.yieldPerHa-a.yieldPerHa:a.yieldPerHa-b.yieldPerHa)||a.mapBlockCode.localeCompare(b.mapBlockCode));
  const available=new Set(eligible.map(r=>r.mapBlockCode));
  return {matches,blockCodes:[...new Set(matches.map(r=>r.mapBlockCode))],eligibleBlocks:available.size,cohortBlocks:cohort.size,missingBlocks:[...cohort].filter(code=>!available.has(code)),selected};
}
