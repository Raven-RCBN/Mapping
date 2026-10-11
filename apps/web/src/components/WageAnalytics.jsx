import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import {displayNumber} from './ProductionTables';
import {money} from './WagesTables';
import {analyseWageCost} from '../../../../packages/shared/wage-analytics.js';

export default function WageAnalytics({estateId,boundary,enabled,offline,selection,onHighlights,onSelect,onMap}) {
  const [year,setYear]=useState('2025'),[basis,setBasis]=useState('monthly'),[task,setTask]=useState(''),[activity,setActivity]=useState('');
  const [operator,setOperator]=useState('gt'),[threshold,setThreshold]=useState('100000'),[meta,setMeta]=useState(null),[rows,setRows]=useState([]);
  const [busy,setBusy]=useState(false),[metaBusy,setMetaBusy]=useState(false),[error,setError]=useState(''),[metaError,setMetaError]=useState(''),[applied,setApplied]=useState(null),[refresh,setRefresh]=useState(0);
  const mapCodes=useMemo(()=>[...new Set((boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No).filter(Boolean))],[boundary]);
  useEffect(()=>{
    if(!enabled||offline)return;
    const c=new AbortController();setMetaBusy(true);setMetaError('');setMeta(null);
    api.get('/wages/meta',{params:{estateId,year,task:task||undefined},signal:c.signal}).then(({data})=>{
      setMeta(data);setMetaBusy(false);
      if(data.years.length&&!data.years.includes(year)){setYear(data.years[0]);setTask('');setActivity('');setApplied(null);}
    }).catch(e=>{if(e.code!=='ERR_CANCELED'){setMetaError(e.response?.data?.error||e.message);setMetaBusy(false);}});
    return()=>c.abort();
  },[estateId,year,task,enabled,offline,refresh]);
  useEffect(()=>{
    if(!enabled||offline)return;
    const c=new AbortController();setBusy(true);setError('');setRows([]);setApplied(null);
    api.get('/wages/allocation',{params:{estateId,year,basis,task:task||undefined,activity:activity||undefined},signal:c.signal}).then(({data})=>{
      if(!Array.isArray(data.byBlock))throw new Error('Block cost analytics is unavailable. Refresh data to retry.');
      setRows(data.byBlock);setBusy(false);
    }).catch(e=>{if(e.code!=='ERR_CANCELED'){setError(e.response?.data?.error||e.message);setBusy(false);}});
    return()=>c.abort();
  },[estateId,year,basis,task,activity,enabled,offline,refresh]);
  const analysis=useMemo(()=>applied?analyseWageCost(rows,mapCodes,applied):null,[rows,mapCodes,applied]);
  const description=applied?`${year} · ${task||'All tasks'} · ${activity||'All activities'} · ${operator==='gt'?'Above':'Below'} NGN ${money(Math.round(Number(threshold)*100))}`:'';
  useEffect(()=>{
    onHighlights(enabled&&!offline&&!busy&&!metaBusy&&!error&&!metaError&&analysis?{estateId,blockCodes:analysis.blockCodes,label:description}:null);
  },[enabled,offline,busy,metaBusy,error,metaError,analysis,description,estateId,onHighlights]);
  useEffect(()=>()=>onHighlights(null),[onHighlights]);
  const change=setter=>e=>{setter(e.target.value);setApplied(null);};
  const valid=year!==''&&threshold.trim()!==''&&Number.isFinite(Number(threshold))&&Number(threshold)>=0;
  const loading=busy||metaBusy;
  const selectedCode=selection?.startsWith(estateId+'::')?selection.slice(estateId.length+2):null;
  return <section className="production-dashboard analytics-dashboard" aria-label="Activity cost analytics">
    <div className="production-heading"><div><h2>Activity cost analytics</h2><p>Find mapped blocks by allocated wage cost · NGN.</p></div><button className="button" disabled={loading||offline} onClick={()=>{setApplied(null);setRefresh(v=>v+1);}}>Refresh data</button></div>
    {offline?<p>Connect to load wage costs for map analytics.</p>:<>
      <form className="production-controls" onSubmit={e=>{e.preventDefault();if(valid&&!loading&&!error&&!metaError)setApplied({operator,threshold});}}>
        <label>Wage year<select value={year} disabled={metaBusy} onChange={e=>{setYear(e.target.value);setTask('');setActivity('');setApplied(null);}}>{!(meta?.years||[]).includes(year)&&<option value={year}>{year}</option>}{(meta?.years||[]).map(y=><option key={y}>{y}</option>)}</select></label>
        <label>Cost source<select value={basis} onChange={change(setBasis)}><option value="monthly">Monthly wage records</option><option value="annual_summary">Annual division summary</option></select></label>
        <label>Task<select value={task} disabled={metaBusy} onChange={e=>{setTask(e.target.value);setActivity('');setApplied(null);}}><option value="">All tasks</option>{task&&!(meta?.tasks||[]).includes(task)&&<option>{task}</option>}{(meta?.tasks||[]).map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Activity<select value={activity} disabled={metaBusy} onChange={change(setActivity)}><option value="">All activities</option>{(meta?.activities||[]).map(a=><option key={a}>{a}</option>)}</select></label>
        <label>Allocated cost<select value={operator} onChange={change(setOperator)}><option value="gt">Above (&gt;)</option><option value="lt">Below (&lt;)</option></select></label>
        <label>Threshold (NGN)<input type="number" min="0" step="0.01" value={threshold} onChange={change(setThreshold)} required/></label>
        <button className="button primary" type="submit" disabled={!valid||loading||!!error||!!metaError||!rows.length||!mapCodes.length}>Show matching blocks</button>
        {applied&&<button className="button" type="button" onClick={()=>setApplied(null)}>Clear highlights</button>}
      </form>
      {loading&&<p role="status">Loading allocated costs…</p>}{(error||metaError)&&<p role="alert" className="production-warning">{error||metaError}</p>}
      {!loading&&!error&&!metaError&&!rows.length&&<p>No allocated costs available for this selection.</p>}
      {analysis&&!loading&&!error&&!metaError&&<>
        <div className="analytics-result-summary" role="status"><span className="analytics-swatch"/><strong>{analysis.blockCodes.length} matching blocks</strong><span>{description}</span><button className="button" onClick={onMap}>View on map</button></div>
        <p>{analysis.eligibleBlocks} of {mapCodes.length} mapped blocks have allocated costs for this selection. {analysis.missingBlocks.length} without allocation records are excluded.</p>
        {analysis.matches.length?<div className="data-table-scroll"><table className="analytics-results"><caption>Allocated block costs · {basis==='monthly'?'Monthly wage records':'Annual division summary'} · {description}</caption><thead><tr><th>Map block</th><th>Division</th><th>Allocated cost (NGN)</th><th>Map ha</th><th>Rate (NGN/ha)</th><th>{basis==='monthly'?'Months with records':'Year'}</th></tr></thead><tbody>{analysis.matches.map(r=><tr key={r.mapBlockCode} aria-selected={r.mapBlockCode===selectedCode}><td><button className="analytics-block-link" onClick={()=>onSelect(r.mapBlockCode)}>{r.mapBlockCode}</button></td><td>{r.division}</td><td>{money(r.amountMinor)}</td><td>{displayNumber(r.mapHa,4)}</td><td>{money(r.rateMinorPerHa)}</td><td>{basis==='monthly'?r.periods.map(p=>p.slice(5)).join(', '):year}</td></tr>)}</tbody></table></div>:<p>No blocks match this threshold. Try another task, activity or amount.</p>}
      </>}
    </>}
  </section>;
}
