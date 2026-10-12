// Monthly cost cells and annual mandays have distinct periods; never distribute
// annual attendance across months or treat zero-value placeholders as work events.
export function buildWageTimeline(items,mandays,year) {
  const days=new Map(mandays.map(r=>[JSON.stringify([r.mapBlockCode,r.division,r.task,r.activity]),r.mandayUnits]));
  const groups=new Map();
  for(const item of items) {
    if(!item.mapBlockCode||!item.period.startsWith(`${year}-`)||item.amountMinor===0)continue;
    const key=JSON.stringify([item.mapBlockCode,item.division,item.task,item.activity]);
    if(!groups.has(key))groups.set(key,{id:key,task:item.task,activity:item.activity,division:item.division,mapBlockCode:item.mapBlockCode,mapHa:item.blockHa,months:new Map(),amountMinor:0});
    const row=groups.get(key);row.amountMinor+=item.amountMinor;
    if(!row.months.has(item.period))row.months.set(item.period,{period:item.period,amountMinor:0,taskNumbers:new Set(),records:0});
    const month=row.months.get(item.period);month.amountMinor+=item.amountMinor;month.records++;
    for(const number of item.taskNumbers||[])month.taskNumbers.add(number);
  }
  return [...groups.values()].map(({months,...row})=>{
    const units=days.get(row.id),mandays=Number.isFinite(units)?units/1e6:null;
    return {...row,mandays,costPerMandayMinor:mandays>0?row.amountMinor/mandays:null,
      rateMinorPerHa:row.mapHa>0?row.amountMinor/row.mapHa:null,
      months:[...months.values()].sort((a,b)=>a.period.localeCompare(b.period)).map(m=>({...m,taskNumbers:[...m.taskNumbers].sort()}))};
  }).sort((a,b)=>a.task.localeCompare(b.task)||a.activity.localeCompare(b.activity));
}
