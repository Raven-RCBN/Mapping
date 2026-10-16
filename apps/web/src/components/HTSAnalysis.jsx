import {fertiliserYield} from '../../../../packages/shared/fertiliser-yield.js';
import FertiliserYieldChart from './FertiliserYieldChart';
import FertiliserWageHistory from './FertiliserWageHistory';
import RainfallMonthlyChart from './RainfallMonthlyChart';
import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import {fertiliserAnalysis,wageAnalysis,fertiliserMapLayer,allocateActivityWages} from '../../../../packages/shared/hts-analysis.js';
import './hts-analysis.css';
const n=(v,d=2)=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const money=v=>'₦'+n(v/100,2);
const compactMoney=v=>Math.abs(v)>=1e11?'₦'+n(v/1e11)+'bn':Math.abs(v)>=1e8?'₦'+n(v/1e8)+'m':money(v);
function download(rows,name){
  if(!rows.length)return;
  const keys=Object.keys(rows[0]),cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
  const csv=[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function Bars({rows,valueKey,labelKey,format=n,onSelect,selected,caption}){
  const max=Math.max(1,...rows.map(r=>r[valueKey]??0));
  return <figure className="hts-bars"><figcaption>{caption}</figcaption>{rows.map(r=><div className="hts-bar-row" key={r[labelKey]}>
    <span>{r[labelKey]}</span><button type="button" disabled={!onSelect} className={String(selected)===String(r[labelKey])?'selected':''} onClick={()=>onSelect?.(r[labelKey])} aria-label={`${r[labelKey]}: ${format(r[valueKey])}`}>
      <span className="hts-bar-fill" style={{width:`${Math.max(0,(r[valueKey]??0)/max*100)}%`}}/>
      <span className="hts-bar-value">{r[valueKey]==null?'No record':format(r[valueKey])}</span></button>
  </div>)}</figure>;
}
function Fertiliser({data,estateId,selection,onBlockChange,onSelect,onHighlights,enabled,offline}){
  const [year,setYear]=useState('2025'),[division,setDivision]=useState(''),[product,setProduct]=useState('solids'),[metric,setMetric]=useState('quantity');
  const block=selection?.startsWith(estateId+'::')?selection.slice(estateId.length+2):'';
  const a=useMemo(()=>fertiliserAnalysis(data,{year,division,block,product,metric}),[data,year,division,block,product,metric]);
 const [production,setProduction]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();setProduction(null);setError('');api.get('/production/yearly',{params:{estateId},signal:c.signal}).then(({data})=>setProduction(data.items)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);});return()=>c.abort();},[estateId]);
 const comparison=useMemo(()=>fertiliserYield(data,production||[],{division,block,product}),[data,production,division,block,product]);
 const selectedYield=comparison.rows.find(r=>String(r.year)===String(year));
  // Keep the estate/division overview visible while a block's history is inspected.
  const overview=useMemo(()=>fertiliserAnalysis(data,{year,division,product,metric}),[data,year,division,product,metric]);
  const divisions=[...new Set(data.fertiliser.map(r=>r.division))].sort();
  const codes=[...new Set(data.fertiliser.filter(r=>r.mapBlockCode&&(!division||r.division===division)).map(r=>r.mapBlockCode))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const baseUnit=product==='solids'?'kg':data.products[Number(product)].unit;
  const unit=metric==='bags'?'bag eq.':metric==='perHa'?baseUnit+'/mapped ha':baseUnit;
  const choose=code=>onSelect?.(code);
  const mapOverview=useMemo(()=>fertiliserAnalysis(data,{year,division,product,metric:baseUnit==='kg'?'perPalm':metric}),[data,year,division,product,baseUnit,metric]);
  const layer=useMemo(()=>fertiliserMapLayer(mapOverview,{estateId,year,division,productLabel:product==='solids'?'Solid fertiliser':data.products[Number(product)].name,unit:baseUnit==='kg'?'kg/palm':unit}),[mapOverview,estateId,year,division,product,unit,baseUnit,data.products]);
  useEffect(()=>{onHighlights(enabled&&!offline?layer:null);},[layer,enabled,offline,onHighlights]);
  useEffect(()=>()=>onHighlights(null),[onHighlights]);
  const exportRows=a.mapped.map(r=>({year:r.year,division:r.division,sourceBlockCode:r.sourceBlockCode,mapBlockCode:r.mapBlockCode,mapHa:r.mapHa,...Object.fromEntries(data.products.map((p,i)=>[p.name+' ('+p.unit+')',r.quantities[i]])),sourceFile:data.sources[0].file,sourceSheet:r.sourceSheet,sourceRow:r.sourceRow,quantityBasis:data.unitBasis,bagWeightKg:50}));
  return <section className="hts-analysis" aria-label="Annual block fertiliser">
    <div className="production-heading"><h2>Annual block fertiliser</h2><button className="button" onClick={()=>download(exportRows,`oban-fertiliser-${year}.csv`)} disabled={!exportRows.length}>Export selected records</button></div>
    <div className="production-controls">
      <label>Year<select value={year} onChange={e=>setYear(e.target.value)}>{[...new Set(data.fertiliserSections.map(r=>r.year))].sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Division<select value={division} onChange={e=>{setDivision(e.target.value);onBlockChange('');}}><option value="">All divisions</option>{divisions.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Map block<select value={block} onChange={e=>onBlockChange(e.target.value)}><option value="">All mapped blocks</option>{block&&!codes.includes(block)&&<option>{block}</option>}{codes.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Product<select value={product} onChange={e=>{setProduct(e.target.value);setMetric('quantity');}}><option value="solids">All solid fertilisers</option>{data.products.map((p,i)=><option key={p.name} value={i}>{p.name} ({p.unit})</option>)}</select></label>
      <label>Measure<select value={metric} onChange={e=>setMetric(e.target.value)}><option value="quantity">Quantity ({baseUnit})</option>{baseUnit==='kg'&&<option value="bags">50 kg bag equivalents</option>}<option value="perHa">{baseUnit} per mapped hectare</option></select></label>
    </div>
    <div className="hts-kpis fertiliser-kpis"><article><span>Mapped quantity · {baseUnit==='kg'?'provisional kg':'L'}</span><strong>{n(a.quantity)} {baseUnit}</strong></article>{baseUnit==='kg'&&<article><span>50 kg bag equivalents</span><strong>{n(a.quantity==null?null:a.quantity/50)}</strong></article>}{baseUnit==='kg'&&<article><span>Kg/Palm</span><strong>{n(a.kgPerPalm)}</strong></article>}<article><span>MT/Ha</span><strong>{n(selectedYield?.mtPerHa)}</strong></article><article><span>Polygons with records</span><strong>{a.blocks.length}</strong></article><article><span>Mapped area of those polygons</span><strong>{n(a.area)} ha</strong></article></div>
    <div className="data-table-scroll"><table><caption>{year} · {block||'Mapped block quantities'}</caption><thead><tr><th>Map block</th><th>Source block / division</th><th>{unit}</th><th>Map ha</th></tr></thead><tbody>{a.blocks.map(b=><tr key={b.mapBlockCode}><td><button className="analytics-block-link" onClick={()=>choose(b.mapBlockCode)}>{b.mapBlockCode}</button></td><td>{b.sourceBlocks.join(' + ')} / {b.divisions.join(', ')}</td><td>{n(b.value)}</td><td>{n(b.mapHa)}</td></tr>)}</tbody></table>{!a.blocks.length&&<p>No block records for this selection.</p>}</div>
    <details className="analytics-method"><summary>Units, coverage and source records</summary><p>{data.unitBasis}</p><p>Liquids stay in litres. Hectares are current map area, not treated area. Shared source blocks on one polygon are summed once per year; the polygon area is counted once. Solid fertiliser map colours show kg per palm in fixed ranges. Liquid product maps use the selected measure.</p><p>{overview.unmapped.length} source block-year records in this year/division have no confirmed map link and are excluded from map totals.</p>{overview.unmapped.length>0&&<button className="button" onClick={()=>download(overview.unmapped,'oban-unmapped-fertiliser.csv')}>Export unmatched records</button>}<p>Source: {data.sources[0].file} · prepared {data.asOf}.</p><p>Annual quantities only; application dates, material costs and treated hectares are unavailable.</p></details>
    <div className="fertiliser-history-grid">
    <div className="hts-annual-history"><Bars rows={a.annual} valueKey="value" labelKey="year" format={v=>v==null?'No record':`${n(v)} ${unit}`} onSelect={setYear} selected={year} caption={`${block||division||'Mapped estate'} · annual history`}/></div>
    <FertiliserYieldChart data={data} estateId={estateId} division={division} block={block} product={product} year={year} onYear={setYear} production={production} error={error} a={comparison}/>
    <FertiliserWageHistory estateId={estateId} block={block} year={year} years={a.annual.map(r=>r.year)}/>
    <RainfallMonthlyChart records={data.rainfall||[]}/>
    </div>


  </section>;
}
function Wages({data,estateId,selection,boundary,onBlockChange}){
  const [year,setYear]=useState('2025'),[month,setMonth]=useState(''),[task,setTask]=useState(''),[activity,setActivity]=useState(''),[measure,setMeasure]=useState('amountMinor');
  const block=selection?.startsWith(estateId+'::')?selection.slice(estateId.length+2):'';
  const mapCodes=useMemo(()=>[...new Set((boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No).filter(Boolean))],[boundary]);
  const allocation=useMemo(()=>allocateActivityWages(data.wages,data.blockMandays,mapCodes,block),[data,mapCodes,block]);
  const a=useMemo(()=>wageAnalysis(allocation.rows,{year,month,task,activity}),[allocation,year,month,task,activity]);
  const tasks=[...new Set(allocation.rows.map(r=>r.task))].sort(),activities=[...new Set(allocation.rows.filter(r=>!task||r.task===task).map(r=>r.activity))].sort();
  const changeYear=y=>{setYear(String(y));setMonth('');};
  const format=measure==='amountMinor'?v=>v==null?'—':money(v):v=>n(v)+' md';
  return <section className="hts-analysis" aria-label="Monthly activity wages">
    <div className="production-heading"><h2>Monthly activity wages · {block||'All mapped blocks'}</h2><button className="button" onClick={()=>download(a.rows.map(({amountMinor,...r})=>({...r,allocatedWagesNGN:amountMinor/100})),`oban-allocated-wages-${block||'mapped-blocks'}-${month||year}.csv`)} disabled={!a.rows.length}>Export selected records</button></div>
    <div className="production-controls">
      <label>Year<select value={year} onChange={e=>changeYear(e.target.value)}>{['2025'].map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Map block<select value={block} onChange={e=>onBlockChange(e.target.value)}><option value="">All mapped blocks</option>{block&&!allocation.blockCodes.includes(block)&&<option>{block}</option>}{allocation.blockCodes.map(code=><option key={code}>{code}</option>)}</select></label>
      <label>Payroll month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="">All months</option>{a.monthly.map(m=><option key={m.period}>{m.period}</option>)}</select></label>
      <label>Task<select value={task} onChange={e=>{setTask(e.target.value);setActivity('');}}><option value="">All tasks</option>{tasks.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Activity<select value={activity} onChange={e=>setActivity(e.target.value)}><option value="">All activities</option>{activities.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Chart measure<select value={measure} onChange={e=>setMeasure(e.target.value)}><option value="amountMinor">Wages (NGN)</option><option value="manDays">Man-days</option></select></label>
    </div>
    <div className="hts-kpis"><article><span>Allocated wages</span><strong title={money(a.amountMinor)}>{compactMoney(a.amountMinor)}</strong></article><article><span>Allocated man-days</span><strong>{n(a.manDays)}</strong></article><article><span>Cost / man-day</span><strong>{a.manDays>0?money(a.amountMinor/a.manDays):'—'}</strong></article><article><span>Activities / source rows</span><strong>{a.activities.length} / {a.count}</strong></article></div>
    <div className="hts-grid"><Bars rows={a.monthly} valueKey={measure} labelKey="period" format={format} onSelect={p=>setMonth(month===p?'':p)} selected={month} caption={`${year} payroll months · click to filter`}/><Bars rows={a.annual} valueKey={measure} labelKey="year" format={format} onSelect={changeYear} selected={year} caption={`Year comparison · ${month?'same payroll month':'full year'}`}/></div>
    <div className="data-table-scroll"><table><caption>Activity breakdown · {month||year}</caption><thead><tr><th>Task</th><th>Activity</th><th>Allocated wages (NGN)</th><th>Allocated man-days</th><th>Cost / man-day</th><th>Rows</th></tr></thead><tbody>{a.activities.map(r=><tr key={r.task+'|'+r.activity}><td>{r.task}</td><td><button className="analytics-block-link" onClick={()=>{setTask(r.task);setActivity(r.activity);}}>{r.activity}</button></td><td>{money(r.amountMinor)}</td><td>{n(r.manDays)}</td><td>{r.manDays>0?money(r.amountMinor/r.manDays):'—'}</td><td>{r.count}</td></tr>)}</tbody></table>{!a.count&&<p>No activity records for this selection.</p>}</div>

  </section>;
}
export default function HTSAnalysis({estateId,boundary,selection,onBlockChange,onSelect,onHighlights,enabled=true,offline,mode='fertiliser'}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setData(null);setError('');if(!enabled||offline)return;const c=new AbortController();api.get('/hts-analysis',{params:{estateId},signal:c.signal}).then(({data})=>setData(data)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);});return()=>c.abort();},[estateId,enabled,offline]);
  if(offline)return <p>Connect to load HTS analysis.</p>;
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p role="status">Loading HTS analysis…</p>;
  if(!Array.isArray(data.fertiliser)||!Array.isArray(data.fertiliserSections)||!Array.isArray(data.products)||!Array.isArray(data.wages))return <p role="alert">The analysis data is incomplete. Refresh the page or reconnect to the estate data service.</p>;
  return mode==='wages'?<Wages data={data} estateId={estateId} boundary={boundary} selection={selection} onBlockChange={onBlockChange}/>:<Fertiliser data={data} estateId={estateId} selection={selection} onBlockChange={onBlockChange} onSelect={onSelect} onHighlights={onHighlights} enabled={enabled} offline={offline}/>;
}
