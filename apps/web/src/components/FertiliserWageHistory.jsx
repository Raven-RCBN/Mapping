import {useEffect,useState} from 'react';
import {api} from '../api';
const money=v=>v==null?'No record':`NGN ${(v/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function FertiliserWageHistory({estateId,block,year}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  setData(null);setError('');if(!block)return;
  const c=new AbortController();
  api.get('/wages/allocation',{params:{estateId,year:String(year),basis:'monthly',mapBlockCode:block,task:'UPKEEP',activity:'FERTILIZER APPLICATION'},signal:c.signal})
   .then(({data})=>setData(data)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);});
  return()=>c.abort();
 },[estateId,block,year]);
 const rows=months.map((label,i)=>{const period=`${year}-${String(i+1).padStart(2,'0')}`;return {label,period,amount:data?.byPeriod?.find(r=>r.name===period)?.amountMinor??null};});
 const max=Math.max(1,...rows.map(r=>Math.abs(r.amount??0)));
 return <section className="fertiliser-wage-history" aria-label="Fertiliser application monthly wages">
  <h3>{block||'Map block'} · monthly application wages · {year}</h3>
  {!block?<p>Select a map block to see its corresponding monthly wages.</p>:error?<p role="alert">{error}</p>:!data?<p role="status">Loading monthly wages…</p>:<>
   <figure className="hts-bars" aria-label={`Monthly wages in NGN · ${block}`} >{rows.map(r=><div className="hts-bar-row" key={r.period}><span>{r.label}</span><div className="hts-bar-track"><span className="hts-bar-fill" style={{width:`${Math.abs(r.amount??0)/max*100}%`}}/><span className="hts-bar-value">{money(r.amount)}</span></div></div>)}</figure>
   <p className="fertiliser-wage-subtitle">UPKEEP · FERTILIZER APPLICATION</p>
   <div className="fertiliser-wage-total"><span>Recorded months · allocated total</span><strong>{data.count?money(data.amountMinor):'No records'}</strong></div>
   {!data.count&&<p>No matching block wage records for {year}. Historical allocations are shown only where the source payroll and that year’s allocation areas are available.</p>}
   <details><summary>Monthly values and allocation</summary><div className="data-table-scroll"><table><thead><tr><th>Month</th><th>Allocated wages (NGN)</th></tr></thead><tbody>{rows.map(r=><tr key={r.period}><td>{r.period}</td><td>{money(r.amount)}</td></tr>)}</tbody></table></div>{data.selectedAreas?.map(a=><p key={a._id||a.mapBlockCode}>{a.mapBlockCode} · {a.division} · {a.mapHa?.toLocaleString(undefined,{maximumFractionDigits:4})} mapped ha</p>)}</details>
  </>}
 </section>;
}
