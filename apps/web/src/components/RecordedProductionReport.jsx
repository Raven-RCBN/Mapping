import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {usePagedTable} from '../usePagedTable';
import {productionNumber,productionCsvNumber} from './ProductionTables';
const columns=[['month','Period'],['mapBlockCode','Map block'],['division','Division'],['sourceBlockCode','Source block'],['mt','Block FFB (MT)'],['bunches','Bunches'],['abw','ABW (kg)'],['totalPalms','Block palms'],['palmsPerEffectiveHa','Palm/Ha'],['effectiveHa','Effective ha'],['metricSource','Reference source'],['yieldPerHa','Ton/Ha']];
export default function RecordedProductionReport({estateId,view,onMap}){
 const annual=view==='yearly',reportColumns=annual?[...columns,['periodLabel','Coverage']]:columns;
 const periodScope=estateId+':'+view;
 const [selection,setSelection]=useState({scope:null,period:''}),[q,setQ]=useState(''),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 const period=selection.scope===periodScope?selection.period:'',setPeriod=period=>setSelection({scope:periodScope,period});
 const exportController=useRef(null),endpoint='/data-tables/'+(annual?'yearly':'monthly');
 const params={estateId,...(period?(annual?{year:period}:{month:period}):{}),q};
 const paged=usePagedTable(endpoint,params),{data,loading:busy,page}=paged,selected=data?.items||[],count=data?.count||0;
 useEffect(()=>()=>exportController.current?.abort(),[estateId,annual,period,q]);
 const exportRows=async()=>{
  const c=new AbortController();exportController.current=c;setExporting(true);setExportError('');
  try{
   let cursor,rows=[];do{const {data:batch}=await api.get(endpoint,{params:{...params,limit:100,cursor},signal:c.signal});rows.push(...batch.items);if(rows.length>5000)throw Error('Narrow the selected reporting period before exporting more than 5,000 records.');cursor=batch.nextCursor}while(cursor);
   if(c.signal.aborted)return;
   const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
   const csv=[reportColumns.map(([,label])=>cell(label)).join(','),...rows.map(r=>reportColumns.map(([k])=>cell(productionCsvNumber(r[k],k))).join(','))].join('\r\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`recorded-block-production-${period||data?.period}.csv`;a.click();URL.revokeObjectURL(url);
  }catch(e){if(e.code!=='ERR_CANCELED')setExportError(e.message)}finally{setExporting(false)}
 };
 return <section className="production-tables" aria-label="Recorded block production report" aria-busy={busy}><div className="table-toolbar production-toolbar"><label>{annual?'Reporting year':'Reporting month'}<select value={period||data?.period||''} onChange={e=>setPeriod(e.target.value)}>{(data?.periods||[period].filter(Boolean)).map(p=><option key={p}>{p}</option>)}</select></label><label>Search block or division<input type="search" maxLength={160} value={q} onChange={e=>setQ(e.target.value)}/></label><span>{count} blocks</span><button className="button" disabled={busy||exporting||!count} onClick={exportRows}>{exporting?'Preparing export…':'Export selected records'}</button></div>
 {busy&&<p role="status">Loading block production…</p>}{(paged.error||exportError)&&<p role="alert">{paged.error||exportError} <button className="button" onClick={paged.retry}>Retry</button></p>}
 <div className="data-table-scroll" tabIndex="0"><table><caption>Recorded block production · {period||data?.period}</caption><thead><tr>{reportColumns.map(([k,label])=><th key={k}>{label}</th>)}</tr></thead><tbody>{selected.map(r=><tr key={r.id} className={r.metricSource==='iPlant fallback'?'production-flag':''}>{reportColumns.map(([k])=><td key={k}>{k==='mapBlockCode'&&r.mapBlockCode?<button className="analytics-block-link" onClick={()=>onMap?.({estateId,blockCode:r.mapBlockCode})}>{r.mapBlockCode}</button>:productionNumber(r[k],k)}</td>)}</tr>)}</tbody></table></div>
 {!busy&&!paged.error&&!count&&<p>No records match this selection.</p>}
 <div className="table-pagination"><button className="button" disabled={!page||busy} onClick={paged.previous}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(count/25))}</span><button className="button" disabled={busy||!data?.nextCursor} onClick={paged.next}>Next</button></div></section>;
}
