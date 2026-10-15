import {useEffect,useState} from 'react';
import {api} from '../api';
const money=v=>v==null?'No record':`NGN ${(v/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function FertiliserWageHistory({estateId,block,year,years=[]}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[wageYear,setWageYear]=useState(String(year)),[availableYears,setAvailableYears]=useState(null);
 useEffect(()=>setWageYear(String(year)),[year,estateId]);
 useEffect(()=>{
  const c=new AbortController();setAvailableYears(null);
  api.get('/wages/meta',{params:{estateId},signal:c.signal}).then(({data})=>setAvailableYears(data.years)).catch(()=>{});
  return()=>c.abort();
 },[estateId]);
 const options=[...new Set([...years.map(String),String(year),...(availableYears||[])])].sort((a,b)=>Number(b)-Number(a));
 useEffect(()=>{
  setData(null);setError('');if(!block)return;
  const c=new AbortController();
  api.get('/wages/allocation',{params:{estateId,year:wageYear,basis:'monthly',mapBlockCode:block,task:'UPKEEP',activity:'FERTILIZER APPLICATION'},signal:c.signal})
   .then(({data})=>setData(data)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);});
  return()=>c.abort();
 },[estateId,block,wageYear]);
 const rows=months.map((label,i)=>{const period=`${wageYear}-${String(i+1).padStart(2,'0')}`;return {label,period,amount:data?.byPeriod?.find(r=>r.name===period)?.amountMinor??null};});
 const max=Math.max(1,...rows.map(r=>Math.abs(r.amount??0)));
 return <section className="fertiliser-wage-history" aria-label="Fertiliser application monthly wages">
  <div className="fertiliser-wage-heading"><h3>{block||'Map block'} · monthly application wages</h3><label>Wage year<select value={wageYear} onChange={e=>setWageYear(e.target.value)}>{options.map(y=><option key={y} value={y}>{y}{availableYears&&!availableYears.includes(y)?' · no records':''}</option>)}</select></label></div>
  {!block?<p>Select a map block to see its corresponding monthly wages.</p>:error?<p role="alert">{error}</p>:!data?<p role="status">Loading monthly wages…</p>:<>
   <figure className="hts-bars" aria-label={`Monthly wages in NGN · ${block}`} >{rows.map(r=><div className="hts-bar-row" key={r.period}><span>{r.label}</span><div className="hts-bar-track"><span className="hts-bar-fill" style={{width:`${Math.abs(r.amount??0)/max*100}%`}}/><span className="hts-bar-value">{money(r.amount)}</span></div></div>)}</figure>
   <p className="fertiliser-wage-subtitle">UPKEEP · FERTILIZER APPLICATION</p>
   <div className="fertiliser-wage-total"><span>Recorded months · allocated total</span><strong>{data.count?money(data.amountMinor):'No records'}</strong></div>
   {!data.count&&<p>No matching block wage records for {wageYear}. Historical allocations are shown only where the source payroll and that year’s allocation areas are available.</p>}
   <details><summary>Monthly values and allocation</summary><div className="data-table-scroll"><table><thead><tr><th>Month</th><th>Allocated wages (NGN)</th></tr></thead><tbody>{rows.map(r=><tr key={r.period}><td>{r.period}</td><td>{money(r.amount)}</td></tr>)}</tbody></table></div>{data.selectedAreas?.map(a=><p key={a._id||a.mapBlockCode}>{a.mapBlockCode} · {a.division} · {a.mapHa?.toLocaleString(undefined,{maximumFractionDigits:4})} mapped ha</p>)}</details>
  </>}
 </section>;
}
