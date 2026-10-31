import RecordActions from './RecordActions';
import {useEstateCurrency} from '../useEstateCurrency';
import {useEffect, useState} from 'react';
import {api} from '../api';
import {usePagedTable} from '../usePagedTable';
import './vehicles.css';

const money = n => n == null ? '—' : (n/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const measure = n => n == null ? 'Not supplied' : n.toLocaleString(undefined,{maximumFractionDigits:3});
const errorMessage = e => e.response?.data?.error || e.message;
const views = [['vehicles','Vehicles'],['transactions','Transactions'],['items','Parts & materials'],['usage','Activity usage']];
export default function VehicleTables({estateId}) {
  const [year,setYear]=useState('2025'),[view,setView]=useState('vehicles'),[vehicleId,setVehicleId]=useState('');
  const [category,setCategory]=useState(''),[month,setMonth]=useState(''),[query,setQuery]=useState('');
  const [meta,setMeta]=useState(null),[error,setError]=useState(''),[detail,setDetail]=useState(null);
  // A view change renders before its effect runs; never render the previous view's row shape.
  const paged=usePagedTable('/vehicles/page',{estateId,year,view,vehicleId:vehicleId||undefined,category:category||undefined,month:month?`${year}-${month}`:undefined,q:query},{enabled:!!estateId});
  const {data:result,page}=paged;
  const {label:currency}=useEstateCurrency(estateId,meta?.currency||result?.currency);
  const setPage=()=>paged.reset();
  useEffect(()=>{
    if(!estateId)return;
    const controller=new AbortController();setMeta(null);
    api.get('/vehicles/meta',{params:{estateId,year},signal:controller.signal}).then(({data})=>setMeta(data))
      .catch(e=>{if(e.code!=='ERR_CANCELED')setError(errorMessage(e));});
    return()=>controller.abort();
  },[estateId,year]);
  const change=(setter,value)=>{setter(value);setPage(0);setDetail(null);};
  const selectView=value=>{change(setView,value);setCategory('');setQuery('');};
  const drillIntoVehicle=id=>{setVehicleId(id);selectView('transactions');};
  if(!estateId)return <section className="vehicle-tables"><h2>Vehicle details</h2><p>Select one estate while online to view its vehicle records.</p></section>;
  const items=result?.items||[],count=result?.count||0,pages=Math.max(1,Math.ceil(count/25));
  const columns=view==='vehicles'?['Vehicle / equipment','Source ID','Transactions',`Recorded cost (${currency})`,'Running hours','Distance (km)','Details']:
    view==='transactions'?['Date','Vehicle / equipment','Transaction','Category','Item / description','Quantity stated',`Amount (${currency})`,'Details']:
    view==='items'?['Category','Item','Unit','Quantity stated','Lines without quantity','Transactions',`Amount (${currency})`]:
    ['Date','Vehicle / equipment','Task','Activity','Block','Hours','Distance (km)','Usage basis','Source'];
  return <section className="production-tables vehicle-tables" aria-label="Vehicle details">
    <div className="vehicle-title"><div><h2>Vehicle details</h2><p>Recorded vehicle and equipment costs, source transactions and block usage.</p></div><span className="vehicle-year">{year}</span></div>
    <div className="vehicle-views" role="group" aria-label="Vehicle table view">{views.map(([id,label])=><button key={id} className={`button ${view===id?'primary':''}`} aria-pressed={view===id} onClick={()=>selectView(id)}>{label}</button>)}</div>
    <div className="production-toolbar table-toolbar">
      <label>Vehicle year<select value={year} onChange={e=>{change(setYear,e.target.value);setVehicleId('');setMonth('');}}>{[...new Set([year,...(meta?.years||[]).map(String)])].sort().reverse().map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Vehicle<select value={vehicleId} onChange={e=>change(setVehicleId,e.target.value)}><option value="">All vehicles</option>{meta?.vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label>Month<select value={month} onChange={e=>change(setMonth,e.target.value)}><option value="">Full year</option>{Array.from({length:12},(_,i)=><option key={i} value={String(i+1).padStart(2,'0')}>{new Date(2025,i,1).toLocaleString(undefined,{month:'long'})}</option>)}</select></label>
      {['transactions','items'].includes(view)&&<label>Category<select value={category} onChange={e=>change(setCategory,e.target.value)}><option value="">All categories</option>{meta?.categories.map(c=><option key={c}>{c}</option>)}</select></label>}
      <label>Search {view==='vehicles'?'vehicles':view==='usage'?'activities':'details'}<input type="search" value={query} maxLength={160} onChange={e=>change(setQuery,e.target.value)} placeholder={view==='vehicles'?'Vehicle name or ID':'Item, description or reference'}/></label>
    </div>
    {result&&<div className="vehicle-totals" aria-live="polite">{view==='usage'?<><strong>{count.toLocaleString()} usage records</strong><span>Running hours: {measure(result.summary.runningHours)}</span><span>Distance (km): {measure(result.summary.distanceKm)}</span></>:<><strong>{currency} {money(result.summary.amountMinor)}</strong><span>{result.summary.vehicleCount.toLocaleString()} vehicles</span><span>{result.summary.transactionCount.toLocaleString()} transactions</span><span>{result.summary.zeroAmountCount.toLocaleString()} zero-amount lines retained</span></>}</div>}
    {(error||paged.error)&&<p className="production-warning" role="alert">{error||paged.error} <button className="button" onClick={paged.retry}>Retry</button></p>}
    {paged.loading&&<p role="status">Loading vehicle records…</p>}
    {view==='usage'&&<p className="table-note">iPlant rows are allocated block hours from vehicle distributions. They are not actual running-log totals. Usage is never inferred from fuel or parts costs.</p>}
    {view==='vehicles'&&<p className="table-note">Running hours and distance are separate activity usage totals for the selected period. “Not supplied” means no value has been recorded.</p>}
    {view==='items'&&<p className="table-note">Quantities come from source descriptions. Items and units are kept separate; cans, tins and sets are not converted to litres. Lines without a quantity remain in the cost total.</p>}
    {result&&<div className="data-table-scroll" tabIndex="0"><table><thead><tr>{columns.map(h=><th key={h}>{h}</th>)}<th>Actions</th></tr></thead><tbody>
      {items.map(r=><tr key={r.id}>
        {view==='vehicles'?<><td><button className="text-button vehicle-name" onClick={()=>drillIntoVehicle(r.id)}>{r.name}</button>{r.identityStatus==='truncated_label'&&<small className="vehicle-flag">Source ID truncated</small>}</td><td>{r.sourceIdentifier||'Incomplete in source'}</td><td>{r.transactionCount}</td><td className="vehicle-number">{r.transactionCount?money(r.amountMinor):'Not supplied'}</td><td>{measure(r.runningHours)}</td><td>{measure(r.distanceKm)}</td><td><button className="text-button" onClick={()=>drillIntoVehicle(r.id)}>View transactions</button></td></>:
        view==='transactions'?<><td>{r.date}</td><td className="vehicle-name">{r.vehicleName}</td><td>{r.transactionNo}<small>{r.transactionType}</small></td><td>{r.category}<small>{r.subcategory}</small></td><td className="vehicle-description">{r.description}{r.reviewFlags.length>0&&<small className="vehicle-flag">Source notes available</small>}</td><td>{r.quantity==null?'Not stated':`${measure(r.quantity)} ${r.quantityUnit||''}`}</td><td className="vehicle-number">{money(r.amountMinor)}</td><td><button className="text-button" onClick={()=>setDetail(r)}>Details</button></td></>:
        view==='items'?<><td>{r.category}<small>{r.subcategory}</small></td><td className="vehicle-description">{r.itemName}</td><td>{r.quantityUnit||'Not stated'}</td><td>{r.quantity==null?'Not stated':measure(r.quantity)}</td><td>{r.missingQuantityCount}</td><td>{r.transactionCount}</td><td className="vehicle-number">{money(r.amountMinor)}</td></>:
        <><td>{r.workDate}</td><td>{r.vehicleName}</td><td>{r.task||'—'}</td><td>{r.activityDescription}<small>{r.activityCode||''}</small></td><td>{r.blockCode||'Not linked'}</td><td>{measure(r.runningHours)}</td><td>{measure(r.distanceKm)}</td><td>{r.usageBasis||'Recorded usage'}</td><td>{r.sourceSystem}</td></>}
      <td><RecordActions kind={view==='vehicles'?'vehicles':view==='usage'?'usage':'vehicle-expenses'} estateId={estateId} id={view==='items'?undefined:r.id}/></td></tr>)}
      {!items.length&&<tr><td colSpan={columns.length} className="vehicle-empty">{view==='usage'?'No running hours or kilometre records have been added for this selection.':'No vehicle records match this selection.'}</td></tr>}
    </tbody></table></div>}
    {result&&count>0&&<nav className="table-pagination" aria-label="Vehicle table pagination"><button className="button" disabled={page===0} onClick={()=>{paged.previous();setDetail(null)}}>Previous</button><span>{page*25+1}–{Math.min((page+1)*25,count)} of {count.toLocaleString()} · Page {page+1} of {pages}</span><button className="button" disabled={!result?.nextCursor} onClick={()=>{paged.next();setDetail(null)}}>Next</button></nav>}
    {detail&&<section className="production-editor vehicle-detail" aria-label="Vehicle transaction details"><div className="vehicle-title"><h3>Transaction {detail.transactionNo} · {detail.date}</h3><button className="button" onClick={()=>setDetail(null)}>Close details</button></div><dl>{[
      ['Vehicle',detail.vehicleName],['Description',detail.description],['Employee',detail.employee],['Transaction type',detail.transactionType],['Original expense type',detail.expenseType],
      ['Category',`${detail.category} / ${detail.subcategory}`],[`Amount (${currency})`,money(detail.amountMinor)],['Quantity stated',detail.quantity==null?'Not stated':`${measure(detail.quantity)} ${detail.quantityUnit}`],
      [`Unit price stated (${currency})`,money(detail.unitPriceMinor)],['Source line',detail.sourceLine],['Classification rule',detail.classificationRule],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl>{detail.reviewFlags.length>0&&<><h4>Source notes</h4><ul>{detail.reviewFlags.map(flag=><li key={flag}>{flag.replaceAll('_',' ')}</li>)}</ul><p>The source values and vehicle assignment are preserved for review.</p></>}</section>}
    {meta?.reports.length>0&&<details className="vehicle-source"><summary>Report source and checks</summary>{meta.reports.map(r=><p key={r.id}>{r.company} · {r.branch} · {r.periodStart} to {r.periodEnd}<br/>{r.vehicleCount} vehicles · {r.transactionCount.toLocaleString()} transactions · {currency} {money(r.amountMinor)}<br/>{r.sourceSystem?.startsWith('iplant')?'Imported from iPlant SQL. Costs are matched-block journal allocations; hours are allocated block usage.':'Imported from the copied HTS report. Vehicle totals reconcile to transaction details. Categories were derived from descriptions.'}</p>)}<p>Block-linked source costs are retained in the block ledger. Usage and costs have separate units and must not be added together.</p></details>}
  </section>;
}
