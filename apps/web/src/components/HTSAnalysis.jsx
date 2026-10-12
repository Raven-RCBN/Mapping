import {useEffect,useMemo,useState} from 'react';
import {api} from '../api';
import {fertiliserAnalysis,wageAnalysis} from '../../../../packages/shared/hts-analysis.js';
import './hts-analysis.css';
const n=(v,d=2)=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const money=v=>'₦'+n(v/100,2);
const compactMoney=v=>Math.abs(v)>=1e11?'₦'+n(v/1e11)+'bn':Math.abs(v)>=1e8?'₦'+n(v/1e8)+'m':money(v);
const colours=['#e7f2ee','#b6d9cc','#72b7a0','#2e8f72','#095b46'];
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
function BlockMap({boundary,blocks,onSelect,selected,unit}){
  const shapes=useMemo(()=>{
    const features=(boundary?.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type));
    const polygons=f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    const points=features.flatMap(f=>polygons(f).flat(2));
    if(!points.length)return [];
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const sx=Math.cos((minY+maxY)/2*Math.PI/180),scale=Math.min(880/((maxX-minX)*sx||1),560/(maxY-minY||1));
    const project=p=>`${(10+(p[0]-minX)*sx*scale).toFixed(2)},${(10+(maxY-p[1])*scale).toFixed(2)}`;
    return features.map(f=>({code:f.properties.blockName||f.properties.Block_No,path:polygons(f).map(p=>p.map(r=>'M'+r.map(project).join('L')+'Z').join('')).join('')}));
  },[boundary]);
  const byCode=new Map(blocks.map(b=>[b.mapBlockCode,b]));const max=Math.max(0,...blocks.map(b=>b.value??0));
  const colour=v=>v==null?'#e7e9ec':v===0?'#fff':colours[Math.min(4,Math.floor(v/(max||1)*5))];
  return <div className="hts-map-wrap">
    {shapes.length?<svg className="hts-block-map" viewBox="0 0 900 580" role="group" aria-label="Annual fertiliser by block"><title>Annual fertiliser quantities by mapped block</title>{shapes.map(s=>{
      const b=byCode.get(s.code);return <path key={s.code} d={s.path} fill={colour(b?.value)} stroke={s.code===selected?'#e0951c':'#66766d'} strokeWidth={s.code===selected?3:.7} fillRule="evenodd" role="button" tabIndex={0} aria-label={`${s.code}: ${b?n(b.value)+' '+unit:'No record'}`} onClick={()=>onSelect(s.code)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(s.code);}}}><title>{s.code}: {b?n(b.value)+' '+unit:'No record'}</title></path>;
    })}</svg>:<p>Map geometry unavailable.</p>}
    <div className="hts-legend"><span><i style={{background:'#e7e9ec'}}/>No record</span><span><i style={{background:'#fff'}}/>0</span>{colours.map((c,i)=><span key={c}><i style={{background:c}}/>{n(max*i/5,0)}–{n(max*(i+1)/5,0)}</span>)}<b>{unit}</b></div>
  </div>;
}
function Fertiliser({data,boundary,onSelect}){
  const [year,setYear]=useState('2025'),[division,setDivision]=useState(''),[block,setBlock]=useState(''),[product,setProduct]=useState('solids'),[metric,setMetric]=useState('quantity');
  const a=useMemo(()=>fertiliserAnalysis(data,{year,division,block,product,metric}),[data,year,division,block,product,metric]);
  // Keep the estate/division overview visible while a block's history is inspected.
  const overview=useMemo(()=>fertiliserAnalysis(data,{year,division,product,metric}),[data,year,division,product,metric]);
  const divisions=[...new Set(data.fertiliser.map(r=>r.division))].sort();
  const codes=[...new Set(data.fertiliser.filter(r=>r.mapBlockCode&&(!division||r.division===division)).map(r=>r.mapBlockCode))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const baseUnit=product==='solids'?'kg':data.products[Number(product)].unit;
  const unit=metric==='bags'?'bag eq.':metric==='perHa'?baseUnit+'/mapped ha':baseUnit;
  const choose=code=>{setBlock(code);onSelect?.(code);};
  const exportRows=a.mapped.map(r=>({year:r.year,division:r.division,sourceBlockCode:r.sourceBlockCode,mapBlockCode:r.mapBlockCode,mapHa:r.mapHa,...Object.fromEntries(data.products.map((p,i)=>[p.name+' ('+p.unit+')',r.quantities[i]])),sourceFile:data.sources[0].file,sourceSheet:r.sourceSheet,sourceRow:r.sourceRow,quantityBasis:data.unitBasis,bagWeightKg:50}));
  return <section className="hts-analysis" aria-label="Annual block fertiliser">
    <div className="production-heading"><h2>Annual block fertiliser</h2><button className="button" onClick={()=>download(exportRows,`oban-fertiliser-${year}.csv`)} disabled={!exportRows.length}>Export selected records</button></div>
    <div className="production-controls">
      <label>Year<select value={year} onChange={e=>setYear(e.target.value)}>{[...new Set(data.fertiliserSections.map(r=>r.year))].sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Division<select value={division} onChange={e=>{setDivision(e.target.value);setBlock('');}}><option value="">All divisions</option>{divisions.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Map block<select value={block} onChange={e=>setBlock(e.target.value)}><option value="">All mapped blocks</option>{block&&!codes.includes(block)&&<option>{block}</option>}{codes.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Product<select value={product} onChange={e=>{setProduct(e.target.value);setMetric('quantity');}}><option value="solids">All solid fertilisers</option>{data.products.map((p,i)=><option key={p.name} value={i}>{p.name} ({p.unit})</option>)}</select></label>
      <label>Measure<select value={metric} onChange={e=>setMetric(e.target.value)}><option value="quantity">Quantity ({baseUnit})</option>{baseUnit==='kg'&&<option value="bags">50 kg bag equivalents</option>}<option value="perHa">{baseUnit} per mapped hectare</option></select></label>
    </div>
    <div className="hts-kpis"><article><span>Mapped quantity · {baseUnit==='kg'?'provisional kg':'L'}</span><strong>{n(a.quantity)} {baseUnit}</strong></article>{baseUnit==='kg'&&<article><span>50 kg bag equivalents</span><strong>{n(a.quantity==null?null:a.quantity/50)}</strong></article>}<article><span>Polygons with records</span><strong>{a.blocks.length}</strong></article><article><span>Mapped area of those polygons</span><strong>{n(a.area)} ha</strong></article></div>
    <div className="hts-grid"><div><h3>{year} · {division||'All divisions'}</h3><BlockMap boundary={boundary} blocks={overview.blocks} onSelect={choose} selected={block} unit={unit}/></div><Bars rows={a.annual} valueKey="value" labelKey="year" format={v=>v==null?'No record':`${n(v)} ${unit}`} onSelect={setYear} selected={year} caption={`${block||division||'Mapped estate'} · annual history`}/></div>
    <div className="data-table-scroll"><table><caption>{year} · {block||'Mapped block quantities'}</caption><thead><tr><th>Map block</th><th>Source block / division</th><th>{unit}</th><th>Map ha</th></tr></thead><tbody>{a.blocks.map(b=><tr key={b.mapBlockCode}><td><button className="analytics-block-link" onClick={()=>choose(b.mapBlockCode)}>{b.mapBlockCode}</button></td><td>{b.sourceBlocks.join(' + ')} / {b.divisions.join(', ')}</td><td>{n(b.value)}</td><td>{n(b.mapHa)}</td></tr>)}</tbody></table>{!a.blocks.length&&<p>No block records for this selection.</p>}</div>
    <details className="analytics-method"><summary>Units, coverage and source records</summary><p>{data.unitBasis}</p><p>Liquids stay in litres. Hectares are current map area, not treated area. Shared source blocks on one polygon are summed once per year; the polygon area is counted once. Grey means no source record, not zero. Map colours follow the current year's scale.</p><p>{overview.unmapped.length} source block-year records in this year/division have no confirmed map link and are excluded from map totals.</p>{overview.unmapped.length>0&&<button className="button" onClick={()=>download(overview.unmapped,'oban-unmapped-fertiliser.csv')}>Export unmatched records</button>}<p>Source: {data.sources[0].file} · prepared {data.asOf}.</p><p>Annual quantities only; application dates, material costs and treated hectares are unavailable.</p></details>
  </section>;
}
function Wages({data}){
  const [year,setYear]=useState('2025'),[month,setMonth]=useState(''),[task,setTask]=useState(''),[activity,setActivity]=useState(''),[measure,setMeasure]=useState('amountMinor');
  const a=useMemo(()=>wageAnalysis(data.wages,{year,month,task,activity}),[data,year,month,task,activity]);
  const tasks=[...new Set(data.wages.map(r=>r.task))].sort(),activities=[...new Set(data.wages.filter(r=>!task||r.task===task).map(r=>r.activity))].sort();
  const changeYear=y=>{setYear(String(y));setMonth('');};
  const format=measure==='amountMinor'?v=>v==null?'—':money(v):v=>n(v)+' md';
  const periods=data.periods.filter(p=>p.period.startsWith(year)&&(!month||p.period===month));
  const discrepancy=data.checks.wageMonths.filter(c=>c.period.startsWith(year)&&(!month||c.period===month)&&c.differenceMinor);
  return <section className="hts-analysis" aria-label="Monthly activity wages">
    <div className="production-heading"><h2>Monthly activity wages</h2><button className="button" onClick={()=>download(a.rows,'oban-monthly-activity-wages.csv')} disabled={!a.rows.length}>Export selected records</button></div>
    <div className="production-controls">
      <label>Year<select value={year} onChange={e=>changeYear(e.target.value)}>{['2025','2024','2023','2022','2021'].map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Payroll month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="">All months</option>{a.monthly.map(m=><option key={m.period}>{m.period}</option>)}</select></label>
      <label>Task<select value={task} onChange={e=>{setTask(e.target.value);setActivity('');}}><option value="">All tasks</option>{tasks.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Activity<select value={activity} onChange={e=>setActivity(e.target.value)}><option value="">All activities</option>{activities.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Chart measure<select value={measure} onChange={e=>setMeasure(e.target.value)}><option value="amountMinor">Wages (NGN)</option><option value="manDays">Man-days</option></select></label>
    </div>
    <div className="hts-kpis"><article><span>Activity wages · estate total</span><strong title={money(a.amountMinor)}>{compactMoney(a.amountMinor)}</strong></article><article><span>Reported man-days</span><strong>{n(a.manDays)}</strong></article><article><span>Wage spend per reported man-day</span><strong>{a.manDays>0?money(a.amountMinor/a.manDays):'—'}</strong></article><article><span>Activities / source rows</span><strong>{a.activities.length} / {a.count}</strong></article></div>
    <div className="hts-grid"><Bars rows={a.monthly} valueKey={measure} labelKey="period" format={format} onSelect={p=>setMonth(month===p?'':p)} selected={month} caption={`${year} payroll months · click to filter`}/><Bars rows={a.annual} valueKey={measure} labelKey="year" format={format} onSelect={changeYear} selected={year} caption={`Year comparison · ${month?'same payroll month':'full year'}`}/></div>
    <div className="data-table-scroll"><table><caption>Activity breakdown · {month||year}</caption><thead><tr><th>Task</th><th>Activity</th><th>Wages (NGN)</th><th>Man-days</th><th>Spend / man-day</th><th>Rows</th></tr></thead><tbody>{a.activities.map(r=><tr key={r.task+'|'+r.activity}><td>{r.task}</td><td><button className="analytics-block-link" onClick={()=>{setTask(r.task);setActivity(r.activity);}}>{r.activity}</button></td><td>{money(r.amountMinor)}</td><td>{n(r.manDays)}</td><td>{r.manDays>0?money(r.amountMinor/r.manDays):'—'}</td><td>{r.count}</td></tr>)}</tbody></table>{!a.count&&<p>No activity records for this selection.</p>}</div>
    <details className="analytics-method"><summary>Payroll periods, checks and source detail{discrepancy.length?' · total discrepancy':''}</summary><p>Observed estate activity totals, including non-field tasks; no block allocation. Do not add these to existing division wages. Spend per man-day is total wages ÷ reported man-days, not the contractual wage rate. Points may have different payment units and are not treated as hectares.</p>{discrepancy.map(c=><p key={c.period}>{c.period}: activity detail {money(c.detailMinor)}; category summary {money(c.totalMinor)}. Analysis uses activity detail; discrepancy {money(-c.differenceMinor)}.</p>)}<p>Historical copies and carryover sheets are excluded. Wage periods cross calendar-month boundaries.</p><ul>{periods.map(p=><li key={p.period}>{p.period} — {p.sourceSheet}: {p.periodLabel}</li>)}</ul><div className="data-table-scroll"><table><caption>Selected source rows (first 100; export includes all {a.count})</caption><thead><tr><th>Period</th><th>Activity</th><th>Rate</th><th>Points</th><th>Man-days</th><th>Amount</th><th>Source</th></tr></thead><tbody>{a.rows.slice(0,100).map(r=><tr key={r.period+':'+r.sourceRow}><td>{r.period}</td><td>{r.activity}</td><td>{n(r.rate)}</td><td>{n(r.points)}</td><td>{n(r.manDays)}</td><td>{money(r.amountMinor)}</td><td>{r.sourceSheet}!row {r.sourceRow}</td></tr>)}</tbody></table></div></details>
  </section>;
}
export default function HTSAnalysis({estateId,boundary,enabled=true,offline,mode='fertiliser'}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setData(null);setError('');if(!enabled||offline)return;const c=new AbortController();api.get('/hts-analysis',{params:{estateId},signal:c.signal}).then(({data})=>setData(data)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);});return()=>c.abort();},[estateId,enabled,offline]);
  if(offline)return <p>Connect to load HTS analysis.</p>;
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p role="status">Loading HTS analysis…</p>;
  return mode==='wages'?<Wages data={data}/>:<Fertiliser data={data} boundary={boundary}/>;
}
