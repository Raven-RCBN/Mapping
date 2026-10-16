const finite = v => Number.isFinite(v) && v >= 0;
export function shiftMonth(month, offset) {
 const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7);
}
export function decisionSupport(rows, rainfall=[], {asOf=new Date().toISOString().slice(0,7),dropPercent=20,block=''}={}) {
 const estateClosed=rows.filter(r=>/^\d{4}-\d{2}$/.test(r.month||'')&&r.month<asOf);
 const closed=estateClosed.filter(r=>!block||r.mapBlockCode===block);
 const observed=estateClosed.filter(r=>r.receiptStatus==='received'&&finite(r.mt));
 const latest=(observed.length?observed:estateClosed).map(r=>r.month).sort().at(-1)||null;
 const valid=r=>r.receiptStatus==='received'&&finite(r.mt)&&finite(r.effectiveHa)&&r.effectiveHa>0;
 const key=r=>`${r.sourceBlockId}|${r.month}`;
 const groups=new Map();for(const r of closed){const k=key(r);groups.set(k,[...(groups.get(k)||[]),r]);}
 const unique=closed.filter(r=>groups.get(key(r)).length===1);
 const index=new Map(unique.map(r=>[key(r),r]));
 const performance=unique.filter(r=>r.month===latest).map(r=>{
  const previous=index.get(`${r.sourceBlockId}|${shiftMonth(latest,-12)}`);
  const currentYield=valid(r)?r.mt/r.effectiveHa:null,previousYield=previous&&valid(previous)?previous.mt/previous.effectiveHa:null;
  const comparable=currentYield!==null&&previousYield>0&&r.mapBlockCode===previous.mapBlockCode&&Math.abs(r.effectiveHa/previous.effectiveHa-1)<=.05&&r.plantingYear===previous.plantingYear;
  const change=comparable?(currentYield/previousYield-1)*100:null;
  return {...r,currentYield,previousYield,change,status:!valid(r)?'Missing data':change!==null&&change<=-dropPercent?'Review decline':change===null?'No comparable baseline':'Within threshold'};
 }).sort((a,b)=>(a.change??Infinity)-(b.change??Infinity));
 const alerts=performance.filter(r=>r.status==='Missing data'||r.status==='Review decline').map(r=>({id:`${r.sourceBlockId}-${latest}-${r.status}`,block:r.mapBlockCode,title:r.status==='Missing data'?'Production data needs review':'Yield decline needs investigation',detail:r.status==='Missing data'?`${r.sourceBlockCode||r.sourceBlockId}: missing production or effective area for ${latest}.`:`${r.sourceBlockCode||r.sourceBlockId}: ${Math.abs(r.change).toFixed(1)}% below the same month last year (${latest}).`,action:r.status==='Missing data'?'Check the monthly production record and effective hectares.':'Check harvest completion, reporting, palm condition and recent field operations.',severity:r.status==='Missing data'?'Data quality':'Review'}));
 if(latest&&latest<shiftMonth(asOf,-1))alerts.unshift({id:`stale-${latest}`,title:'Production reporting is behind',detail:`Latest closed reporting month: ${latest}.`,action:'Update production before using the outlook for scheduling.',severity:'Data quality'});
 if(closed.length!==unique.length)alerts.unshift({id:'duplicate-production',title:'Duplicate source records excluded',detail:`${closed.length-unique.length} records have repeated source/month keys.`,action:'Resolve duplicate records before forecasting.',severity:'Data quality'});
 const forecast=[0,1,2].map(offset=>{
  const month=shiftMonth(asOf,offset),baseline=shiftMonth(month,-12);
  const cohort=performance.filter(valid);const pairs=cohort.map(r=>({current:r,past:index.get(`${r.sourceBlockId}|${baseline}`)})).filter(({current,past})=>past&&valid(past)&&past.mapBlockCode===current.mapBlockCode&&past.plantingYear===current.plantingYear&&Math.abs(past.effectiveHa/current.effectiveHa-1)<=.05);
  return {month,baseline,mt:pairs.length?pairs.reduce((n,p)=>n+p.past.mt,0):null,ha:pairs.reduce((n,p)=>n+p.past.effectiveHa,0),sources:pairs.length,eligible:cohort.length};
 });
 const rain=rainfall.flatMap(y=>(y.monthly||[]).filter(m=>m.status==='recorded'&&finite(m.mm)).map(m=>({month:`${y.year}-${String(m.month).padStart(2,'0')}`,mm:m.mm}))).filter(r=>r.month<asOf).sort((a,b)=>a.month.localeCompare(b.month));
 const lastRain=rain.at(-1);const history=lastRain?rain.filter(r=>r.month<lastRain.month&&r.month.slice(5)===lastRain.month.slice(5)):[];
 const normal=history.length>=3?history.reduce((n,r)=>n+r.mm,0)/history.length:null;
 return {latest,performance,alerts,forecast,rainfall:lastRain?{...lastRain,normal,years:history.length,change:normal>0?(lastRain.mm/normal-1)*100:null}:null};
}
export function weatherGuidance(days,{rain=20,wind=25}={}) {
 return days.filter(d=>Number.isFinite(d.rainMm)&&d.rainMm>=rain||Number.isFinite(d.windKmh)&&d.windKmh>=wind).map(d=>({id:`weather-${d.date}`,title:'Review fieldwork schedule',severity:'Weather watch',detail:`${d.date}: ${d.rainMm??'—'} mm forecast rain; maximum wind ${d.windKmh??'—'} km/h.`,action:'Review fertiliser and spraying plans with the field supervisor; check access and drainage. Forecast guidance, not an official warning.'}));
}
