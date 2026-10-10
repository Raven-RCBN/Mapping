// Integer kobo allocation. Largest remainders reconcile each original cost exactly.
export function allocateMinor(amount, areas){
  const weights=areas.map(a=>BigInt(Math.round(a.mapHa*1e10)));
  const total=weights.reduce((a,b)=>a+b,0n);
  if(!total)return [];
  const absolute=BigInt(Math.abs(amount)),denominator=total;
  const parts=weights.map((weight,i)=>{const product=absolute*BigInt(weight);return {i,value:Number(product/denominator),remainder:product%denominator};});
  let left=Math.abs(amount)-parts.reduce((n,p)=>n+p.value,0);
  parts.sort((a,b)=>a.remainder===b.remainder?String(areas[a.i]._id).localeCompare(String(areas[b.i]._id)):a.remainder>b.remainder?-1:1);
  for(let i=0;i<left;i++)parts[i].value++;
  return parts.sort((a,b)=>a.i-b.i).map(p=>p.value*Math.sign(amount));
}
export function allocateWages(wages,areas,selectedCode){
  const groups=new Map();for(const a of areas){if(!groups.has(a.division))groups.set(a.division,[]);groups.get(a.division).push(a);}
  const coverage=new Map(),rows=new Map(),sources=new Map();
  let mappedMinor=0,unmappedMinor=0,unallocatedMinor=0,directMinor=0;
  for(const wage of wages){
    if(wage.sourceBlockCode){directMinor+=wage.amountMinor;continue;}
    const group=groups.get(wage.division)||[],missing=group.filter(a=>a.mapHa==null),area=group.reduce((n,a)=>n+(a.mapHa||0),0);
    const reason=!group.length?'No mapped blocks assigned to this division':missing.length?`${missing.length} map areas missing`:area<=0?'No positive map area':null;
    if(!coverage.has(wage.division))coverage.set(wage.division,{division:wage.division,blocks:group.length,missing:missing.length,mapHa:area,reason,amountMinor:0});
    coverage.get(wage.division).amountMinor+=wage.amountMinor;
    if(reason){unallocatedMinor+=wage.amountMinor;continue;}
    const values=allocateMinor(wage.amountMinor,group);
    group.forEach((a,i)=>{
      if(a.mapBlockCode)mappedMinor+=values[i];else unmappedMinor+=values[i];
      if(selectedCode&&a.mapBlockCode!==selectedCode)return;
      sources.set(a._id,{...a,divisionHa:area,share:a.mapHa/area});
      const key=JSON.stringify([a._id,wage.period,wage.task,wage.activity,wage.sourceSerial||wage.sourceKey]);
      if(!rows.has(key))rows.set(key,{id:key,period:wage.period,sourceBlockCode:a.sourceBlockCode,mapBlockCode:a.mapBlockCode,
        division:a.division,task:wage.task,activity:wage.activity,amountMinor:0,divisionAmountMinor:0,rateMinorPerHa:0,blockHa:a.mapHa,divisionHa:area,taskNumbers:[]});
      const row=rows.get(key);row.amountMinor+=values[i];row.divisionAmountMinor+=wage.amountMinor;
      row.rateMinorPerHa=row.divisionAmountMinor/area;
      if(wage.sourceSerial&&!row.taskNumbers.includes(wage.sourceSerial))row.taskNumbers.push(wage.sourceSerial);
    });
  }
  return {items:[...rows.values()],sources:[...sources.values()],coverage:[...coverage.values()],mappedMinor,unmappedMinor,unallocatedMinor,directMinor};
}
