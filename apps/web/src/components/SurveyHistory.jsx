import {useEffect,useState} from 'react';
import {api} from '../api';
import {useAccess} from '../useAccess';
export default function SurveyHistory({estateId,offline,onOpenReport}){
 const {can}=useAccess(estateId),allowed=can('geospatial')&&can('map');
 const [reports,setReports]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  setReports([]);setError('');if(!allowed||offline)return;
  const c=new AbortController();setBusy(true);
  api.get('/geospatial-analysis',{params:{estateId},signal:c.signal}).then(({data})=>setReports(data.reports)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();
 },[estateId,allowed,offline]);
 if(!allowed)return null;
 return <section className="survey-history" aria-label="Mapping survey history"><h3>Mapping survey history</h3><p>Each survey keeps its own capture date, report and upload record for annual comparison.</p>
 {offline?<p>Connect to load the survey archive.</p>:busy?<p role="status">Loading mapping history…</p>:error?<p role="alert">{error}</p>:!reports.length?<p>No survey reports recorded for this location.</p>:<ol>{reports.map(r=><li key={r._id}><strong>{r.title}</strong><dl><div><dt>Imagery / survey</dt><dd>{r.surveyDate}</dd></div><div><dt>Report issued</dt><dd>{r.reportDate} (month)</dd></div><div><dt>Block map dated</dt><dd>{r.mappingDate||'Not recorded'}</dd></div><div><dt>Uploaded</dt><dd>{r.importedAt?.slice(0,10)||'Not recorded'}</dd></div><div><dt>Annual survey target</dt><dd>{r.nextSurveyDue||'Not recorded'} {r.nextSurveyDue?'· suggested, not booked':''}</dd></div></dl><p>{r.sourceFiles?.length||1} source documents · {r.summary?.totalPalms?.toLocaleString()||'—'} assessed palms · {r.summary?.mappedAreaHa?.toLocaleString()||'—'} survey ha</p><details><summary>Source documents</summary><ul>{(r.sourceFiles||[r.sourceFile]).map(f=><li key={f}>{f}</li>)}</ul></details><p>Annual target is based on the imagery date, not the later report or upload date. A newer survey should be added as a new record.</p>{onOpenReport&&<button className="button" onClick={()=>onOpenReport(r._id)}>View Geospatial Analysis</button>}</li>)}</ol>}
 </section>;
}
