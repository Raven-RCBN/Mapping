import {useEffect,useState} from 'react';
import {api} from '../api';
const n=(v,d=3)=>v.toLocaleString(undefined,{maximumFractionDigits:d});
export default function AnnualYieldReference({estateId,block,asOf,refresh}){
 const [state,setState]=useState({});
 useEffect(()=>{
  const c=new AbortController();setState({});
  if(block)api.get('/production/yearly',{params:{estateId,mapBlockCode:block},signal:c.signal})
   .then(({data})=>{if(!c.signal.aborted)setState({block,rows:data.items});})
   .catch(()=>{if(!c.signal.aborted)setState({block,error:true});});
  return()=>c.abort();
 },[estateId,block,refresh]);
 if(!block)return null;
 const year=Number(asOf.slice(0,4))-1;
 const rows=state.block===block?state.rows?.filter(r=>r.mapBlockCode===block&&Number(r.year)===year):null;
 const complete=rows?.length>0&&new Set(rows.map(r=>r.sourceBlockId)).size===rows.length&&rows.every(r=>r.periodLabel==='Full year'&&r.receiptStatus==='received'&&Number.isFinite(r.mt)&&r.mt>=0&&Number.isFinite(r.effectiveHa)&&r.effectiveHa>0);
 const tonnes=complete?rows.reduce((sum,r)=>sum+r.mt,0):0,ha=complete?rows.reduce((sum,r)=>sum+r.effectiveHa,0):0;
 return <div className="ds-banner"><strong>{block} · {year} annual recorded yield</strong>{complete?<><p><strong>{n(tonnes/ha)} tonnes/ha (MT/Ha)</strong> = {n(tonnes)} tonnes ÷ {n(ha,4)} effective hectares · full year.</p><p>The monthly chart below can show tonnes per hectare or total tonnes. Annual yield uses the production record’s effective area, which can differ from the map polygon area.</p></>:<p>{state.block!==block?'Loading annual reference…':state.error?'Annual reference could not be loaded.':'A complete annual reference with effective hectares is unavailable.'}</p>}</div>;
}
