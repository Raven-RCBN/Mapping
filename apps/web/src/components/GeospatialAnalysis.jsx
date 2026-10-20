import {useEffect,useState} from 'react';
import {api,apiBase,authorisedFile} from '../api';
const sections=[['overview','Report overview'],['inventory','Field hectareage & palm inventory'],['density','Stand density'],['growth','Palm growth status'],['priority','Findings & recommendations'],['highlight','Highlight — source differences']];
const number=v=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
export default function GeospatialAnalysis({estateId,initialReportId,offline,onHighlights,onSelect,onMap}){
  const [reports,setReports]=useState([]),[reportId,setReportId]=useState(''),[section,setSection]=useState('overview'),[page,setPage]=useState(1),[result,setResult]=useState({items:[],total:0}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[layer,setLayer]=useState(''),[retry,setRetry]=useState(0);
  const report=reports.find(r=>r._id===reportId);
  useEffect(()=>{
    setReports([]);setReportId('');setLayer('');setError('');if(offline)return;
    const c=new AbortController();setBusy(true);
    api.get('/geospatial-analysis',{params:{estateId},signal:c.signal}).then(({data})=>{setReports(data.reports);setReportId(data.reports.some(r=>r._id===initialReportId)?initialReportId:data.reports[0]?._id||'');}).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();
  },[estateId,initialReportId,offline,retry]);
  useEffect(()=>{
    setResult({items:[],total:0});if(!reportId||section==='overview'||offline)return;
    const c=new AbortController();setBusy(true);setError('');
    api.get('/geospatial-analysis/rows',{params:{estateId,reportId,section,page,pageSize:25},signal:c.signal}).then(({data})=>setResult(data)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();
  },[estateId,reportId,section,page,offline,retry]);
  useEffect(()=>{
    const selected=report?.layers?.find(l=>l.key===layer);
    const rows=!busy&&!error?result.items.filter(r=>r.mapBlockCode):[];
    const colors=Object.fromEntries(rows.map(r=>[r.mapBlockCode,section==='density'?({Moderate:'#34834a',Fair:'#b4a22a',Marginal:'#e1922c',Low:'#bf392d'}[r.densityCategory]||'#888'):section==='growth'?(r.poorPercent>=30?'#bf392d':r.poorPercent>=15?'#e1922c':'#34834a'):'#7c3aed']));
    onHighlights(!offline&&(selected||rows.length)?{estateId,blockCodes:rows.map(r=>r.mapBlockCode),colors,kind:'geospatial',label:`${selected?.label||sections.find(s=>s[0]===section)?.[1]} · survey ${report?.surveyDate}`,raster:selected?{...selected,url:`${apiBase}/geospatial-analysis/file/${encodeURIComponent(reportId)}/${encodeURIComponent(layer)}?estateId=${encodeURIComponent(estateId)}`}:null}:null);
    return()=>onHighlights(null);
  },[estateId,report,reportId,layer,offline,onHighlights,result,section,busy,error]);
  async function downloadSource(){
    try{const blob=await authorisedFile(`${apiBase}/geospatial-analysis/file/${encodeURIComponent(reportId)}/report.pdf?estateId=${encodeURIComponent(estateId)}`);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=report.sourceFile;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e.response?.data?.error||'Could not download the source report.');}
  }
  const changeSection=e=>{setSection(e.target.value);setPage(1);};
  return <section className="production-dashboard geospatial-analysis" aria-label="Geospatial Analysis">
    <div className="production-heading"><div><h2>Geospatial Analysis</h2><p>Survey findings, source measurements and links to the estate map.</p></div><button className="button" disabled={busy||offline} onClick={()=>setRetry(x=>x+1)}>Refresh</button></div>
    {offline?<p>Connect to view survey reports and map layers.</p>:<>
      <div className="production-controls"><label>Survey report<select value={reportId} disabled={!reports.length||busy} onChange={e=>{setReportId(e.target.value);setPage(1);setLayer('');}}>{!reports.length&&<option value="">No reports available</option>}{reports.map(r=><option key={r._id} value={r._id}>{r.surveyDate} · {r.title}</option>)}</select></label>
      <label>Analysis<select value={section} onChange={changeSection}>{sections.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
      {report?.layers?.length>0&&<label>Map overlay<select value={layer} onChange={e=>setLayer(e.target.value)}><option value="">Current estate map</option>{report.layers.map(l=><option key={l.key} value={l.key}>{l.label}</option>)}</select></label>}<button className="button" disabled={!report||busy} onClick={onMap}>View analysis on map</button></div>
      {busy&&<p role="status">Loading survey data…</p>}{error&&<p role="alert" className="production-warning">{error}</p>}
      {!busy&&!error&&!reports.length&&<p>No geospatial report has been imported for this location.</p>}
      {report&&<><button className="button" onClick={downloadSource}>Download source report</button><p><strong>Imagery: {report.surveyDate}</strong> · Report: {report.reportDate} · {report.sourceFile}</p><p>Survey measurements retain their original date. Map links use the current block register; historical aliases and area differences are marked for review.</p>
      {section==='density'&&<p>Map markers: green = Moderate, gold = Fair, orange = Marginal, red = Low. Only this page’s linked blocks are highlighted.</p>}
      {section==='growth'&&<p>Map markers show Poor + Very Poor share: green &lt;15%, orange 15–&lt;30%, red ≥30% (display bands, not report diagnoses). The source overlay uses its original palm colours: dark green Optimal, green Satisfactory, light green Fair, orange Poor, red Very Poor.</p>}
      {section==='overview'?<><div className="geo-metrics">{[['Mapped area (ha)','mappedAreaHa'],['Assessed mature area (ha)','matureAreaHa'],['Assessed palms','totalPalms'],['Stand density (palms/ha)','palmsPerHectare']].map(([label,key])=><div key={key}><span>{label}</span><strong>{number(report.summary?.[key])}</strong></div>)}</div>{report.findings?.map(f=><article key={f.title}><h3>{f.title}</h3><p>{f.text} <small>PDF pages {f.pages.join(', ')}</small></p></article>)}<details><summary>Source notes and limits</summary><ul>{report.issues?.map(i=><li key={i}>{i}</li>)}</ul></details></>:<>
      {section==='priority'&&report.findings?.filter(f=>f.title==='Priority field checks').map(f=><p key={f.title}>{f.text} Field verification is required before treatment or replanting decisions.</p>)}
      {!busy&&!error&&<><div className="data-table-scroll"><table><caption>{sections.find(s=>s[0]===section)?.[1]} · {result.total} records</caption><thead><tr><th>Source block / map link</th><th>Planting year</th><th>Cohort</th><th>Survey ha</th><th>Current ha</th><th>Palms</th><th>Palms/ha</th><th>Density</th>{section==='growth'&&['Optimal','Satisfactory','Fair','Poor','Very poor','Unclassified'].map(x=><th key={x}>{x}</th>)}<th>Source / highlight</th></tr></thead><tbody>{result.items.map(r=><tr key={r._id} className={r.highlight?'geo-highlight':''}><td>{r.mapBlockCode?<button className="analytics-block-link" onClick={()=>onSelect(r.mapBlockCode)}>{r.sourceBlockCode}</button>:r.sourceBlockCode}<small className="geo-match">{r.mapBlockCode?`${r.mapBlockCode} · ${r.mapMatch}`:'No confirmed current block allocation'}</small></td><td>{r.plantingYear||'—'}</td><td>{r.cohort}</td><td>{number(r.surveyAreaHa)}</td><td>{number(r.currentAreaHa)}</td><td>{number(r.totalPalms)}</td><td>{number(r.palmsPerHectare)}</td><td>{r.densityCategory||'Not assessed'}</td>{section==='growth'&&['optimal','satisfactory','fair','poor','veryPoor','unclassified'].map(k=><td key={k}>{number(r.growth?.[k])}</td>)}<td>PDF p. {r.sourcePages?.join(', ')}{r.issues?.map(i=><p key={i}>{i}</p>)}</td></tr>)}</tbody></table></div><div className="geo-pagination"><button className="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(result.total/25))}</span><button className="button" disabled={page*25>=result.total} onClick={()=>setPage(p=>p+1)}>Next</button></div><p>Unassessed counts are shown as —. Highlight rows retain the source differences.</p></>}
      </>}</>}
    </>}
  </section>;
}
