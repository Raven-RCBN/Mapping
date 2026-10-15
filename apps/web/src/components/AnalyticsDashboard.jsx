import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import {displayNumber,productionNumber} from './ProductionTables';
import WageAnalytics from './WageAnalytics';
import ActivityTimeline from './ActivityTimeline';
import HTSAnalysis from './HTSAnalysis';
import {analyseYield} from '../../../../packages/shared/production-analytics.js';

function YieldAnalytics({estateId,boundary,enabled,offline,selection,onHighlights,onSelect,onMap}) {
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[year,setYear]=useState(''),[operator,setOperator]=useState('gt'),[threshold,setThreshold]=useState('20'),[applied,setApplied]=useState(null),[refresh,setRefresh]=useState(0),[plantingYear,setPlantingYear]=useState(''),[plantingInventory,setPlantingInventory]=useState([]);
  const mapCodes=useMemo(()=>[...new Set((boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No).filter(Boolean))],[boundary]);
  useEffect(()=>{setPlantingYear('');setApplied(null);},[estateId]);
  useEffect(()=>{
    if(!enabled||offline)return;
    const c=new AbortController();setBusy(true);setError('');setRows([]);setPlantingInventory([]);setApplied(null);
    api.get('/production/recorded',{params:{estateId},signal:c.signal}).then(({data})=>{
      setRows(data.items);setPlantingInventory(data.plantingInventory||[]);
      const years=[...new Set(data.items.map(r=>r.year))].sort((a,b)=>b-a);
      const complete=years.find(y=>data.items.some(r=>r.year===y&&r.receiptStatus==='received')&&data.items.filter(r=>r.year===y&&r.receiptStatus==='received').every(r=>r.periodLabel==='Full year'));
      setYear(current=>years.includes(Number(current))?current:String(complete??years[0]??''));setBusy(false);
    }).catch(e=>{if(e.code!=='ERR_CANCELED'){setError(e.response?.data?.error||e.message);setBusy(false);}});
    return()=>c.abort();
  },[estateId,enabled,offline,refresh]);
  const years=[...new Set(rows.map(r=>r.year))].sort((a,b)=>b-a);
  const plantingYears=[...new Set(plantingInventory.filter(b=>mapCodes.includes(b.mapBlockCode)&&/^\d{4}$/.test(b.plantingYear||'')).map(b=>b.plantingYear))].sort();
  const analysis=useMemo(()=>applied?analyseYield(rows,mapCodes,applied,plantingInventory):null,[rows,mapCodes,applied,plantingInventory]);
  const description=applied?`${applied.year} · ${applied.plantingYear?'Planted '+applied.plantingYear:'All planting years'} · ${applied.operator==='gt'?'Above':'Below'} ${displayNumber(Number(applied.threshold))} Ton/Ha`:'';
  useEffect(()=>{
    onHighlights(enabled&&!offline&&!busy&&!error&&analysis?{estateId,blockCodes:analysis.blockCodes,label:description}:null);
  },[enabled,offline,busy,error,analysis,description,estateId,onHighlights]);
  useEffect(()=>()=>onHighlights(null),[onHighlights]);
  const change=setter=>e=>{setter(e.target.value);setApplied(null);};
  const valid=year!==''&&threshold.trim()!==''&&Number.isFinite(Number(threshold))&&Number(threshold)>=0;
  const selectedCode=selection?.startsWith(estateId+'::')?selection.slice(estateId.length+2):null;
  return <section className="production-dashboard analytics-dashboard" aria-label="Yield analytics">
    <div className="production-heading"><div><h2>Yield analytics</h2><p>Find mapped blocks by annual production per hectare.</p></div><button className="button" disabled={busy||offline} onClick={()=>setRefresh(v=>v+1)}>Refresh data</button></div>
    {offline?<p>Connect to load annual production for map analytics.</p>:<>
      <form className="production-controls" onSubmit={e=>{e.preventDefault();if(valid)setApplied({year,plantingYear,operator,threshold});}}>
        <label>Analytics year<select value={year} disabled={busy||!years.length} onChange={change(setYear)}>{!years.length&&<option value="">No years available</option>}{years.map(y=><option key={y} value={y}>{y}{rows.some(r=>r.year===y&&r.periodLabel!=='Full year')?' · YTD / partial':''}</option>)}</select></label>
        <label>Year of planting<select value={plantingYear} disabled={busy} onChange={change(setPlantingYear)}><option value="">All planting years</option>{plantingYears.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
        <label>Production per hectare<select value={operator} onChange={change(setOperator)}><option value="gt">Above (&gt;)</option><option value="lt">Below (&lt;)</option></select></label>
        <label>Threshold (Ton/Ha)<input type="number" min="0" step="any" value={threshold} onChange={change(setThreshold)} required/></label>
        <div className="analytics-form-actions">
        <button className="button primary" type="submit" disabled={!valid||busy||!rows.length||!mapCodes.length}>Show matching blocks</button>
        {applied&&<button className="button" type="button" onClick={()=>setApplied(null)}>Clear highlights</button>}
        </div>
      </form>
      {busy&&<p role="status">Loading annual production…</p>}{error&&<p role="alert" className="production-warning">{error}</p>}
      {!busy&&!error&&!rows.length&&<p>No annual production records available.</p>}
      {analysis&&!busy&&!error&&<>
        <div className="analytics-result-summary" role="status"><span className="analytics-swatch"/><strong>{analysis.blockCodes.length} matching blocks</strong><span>{description}</span><button className="button" onClick={onMap}>View on map</button></div>
        <p>{analysis.eligibleBlocks} of {analysis.cohortBlocks} mapped blocks{applied.plantingYear?` planted in ${applied.plantingYear}`:''} have usable yield data for {applied.year}. {analysis.missingBlocks.length} without yield data are excluded.</p>
        {analysis.selected.some(r=>r.periodLabel!=='Full year')&&<p>Partial-year records are labelled by their reporting period below.</p>}
        {analysis.matches.length?<div className="data-table-scroll"><table className="analytics-results"><caption>Matching blocks · {description}</caption><thead><tr><th>Map block</th><th>Year of planting</th><th>Division</th><th>Source block</th><th>Palm stand</th><th>Palm/Ha</th><th>Ton/Ha</th><th>Block FFB (MT)</th><th>Effective ha</th><th>Period</th></tr></thead><tbody>{analysis.matches.map(r=><tr key={r.id||`${r.sourceBlockId}-${r.year}`} aria-selected={r.mapBlockCode===selectedCode}><td><button className="analytics-block-link" onClick={()=>onSelect(r.mapBlockCode)}>{r.mapBlockCode}</button></td><td>{r.mapPlantingYear||'Not recorded'}</td><td>{r.division}</td><td>{r.sourceBlockCode}</td><td>{displayNumber(r.totalPalms)}</td><td>{productionNumber(Number.isFinite(r.totalPalms)&&r.totalPalms>=0&&Number.isFinite(r.yieldAreaHa)&&r.yieldAreaHa>0?r.totalPalms/r.yieldAreaHa:null,'palmsPerEffectiveHa')}</td><td>{productionNumber(r.yieldPerHa)}</td><td>{productionNumber(r.mt)}</td><td>{productionNumber(r.yieldAreaHa)}</td><td>{r.periodLabel}</td></tr>)}</tbody></table></div>:<p>No blocks match this threshold. Try another analytics year, planting year or threshold.</p>}
        <details className="analytics-method"><summary>Yield basis and coverage</summary><p>Year of planting comes from the mapped block inventory. All planting years includes blocks whose planting year is not recorded; a specific year excludes them.</p><p>Block tonnes use recorded block MT. Ton/Ha = block tonnes ÷ recorded effective hectares. Palm/Ha = block palm stand ÷ recorded effective hectares. Separate source records sharing a map polygon remain separate. Thresholds use unrounded values; “above” and “below” exclude values exactly equal to the threshold.</p>{analysis.missingBlocks.length>0&&<p>Without usable yield: {analysis.missingBlocks.join(', ')}.</p>}</details>
      </>}
    </>}
  </section>;
}

export default function AnalyticsDashboard(props) {
  const [query,setQuery]=useState('yield');
  return <>
    <div className="analytics-query-control"><label>Analytics query<select value={query} onChange={e=>{props.onHighlights(null);setQuery(e.target.value);}}><option value="yield">Production per hectare</option><option value="cost">Activity cost</option><option value="timeline">Activity timeline</option><option value="fertiliser">Annual block fertiliser</option><option value="wages">Monthly activity wages</option></select></label></div>
    {query==='yield'?<YieldAnalytics {...props}/>:query==='cost'?<WageAnalytics {...props}/>:query==='timeline'?<ActivityTimeline {...props}/>:<HTSAnalysis {...props} mode={query}/>}
  </>;
}
