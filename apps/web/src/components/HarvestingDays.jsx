import {displayNumber} from './ProductionTables';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function HarvestingDays({rows,year,loading}) {
  const groups=new Map();
  for(const r of rows.filter(r=>r.month.startsWith(year+'-'))){
    if(!groups.has(r.sourceBlockId))groups.set(r.sourceBlockId,{name:`${r.sourceBlockCode} · ${r.division}`,values:Array(12).fill(null)});
    groups.get(r.sourceBlockId).values[Number(r.month.slice(5))-1]=r.harvestingDays;
  }
  return <section className="production-chart harvesting-days" aria-label="Monthly harvesting days"><h3>Harvesting days · {year}</h3>{loading?<p role="status">Loading harvesting days…</p>:groups.size?<div className="data-table-scroll"><table><thead><tr><th>Original block / group</th>{months.map(m=><th key={m}>{m}</th>)}</tr></thead><tbody>{[...groups].map(([id,r])=><tr key={id}><th>{r.name}</th>{r.values.map((v,i)=><td key={i}>{v==null?'Not supplied':displayNumber(v)}</td>)}</tr>)}</tbody></table></div>:<p>No harvesting-day records supplied for {year}.</p>}</section>;
}
