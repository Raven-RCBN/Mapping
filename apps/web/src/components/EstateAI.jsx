import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import './estate-ai.css';
const tasks=[['ask-map','Ask the map','Which blocks need a closer look?'],['explain-forecast','Explain the forecast','Explain the current forecast and its uncertainty.'],['estate-briefing','Estate briefing','Summarise the available production evidence for a supervisor.'],['inspection-note','Inspection note','Road near F5 has standing water and soft shoulders after rain.']];
const usd=n=>Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4});
export default function EstateAI({estateId,block,onHighlights}){
 const [status,setStatus]=useState(null),[mode,setMode]=useState('sample'),[action,setAction]=useState('ask-map'),[question,setQuestion]=useState(tasks[0][2]),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const epoch=useRef(0),request=useRef(null);
 const refresh=async()=>{const {data}=await api.get('/ai/status',{params:{estateId}});setStatus(data);};
 useEffect(()=>{epoch.current++;setResult(null);setStatus(null);setMode('sample');setError('');request.current=null;refresh().catch(e=>setError(e.response?.data?.error||'Could not load AI controls.'));return()=>{epoch.current++;};},[estateId]);
 useEffect(()=>{epoch.current++;setBusy(false);setResult(null);request.current=null;onHighlights(null);},[block,action,mode]);
 const changeTask=t=>{setAction(t[0]);setQuestion(t[2]);};
 const run=async()=>{
  const current=epoch.current;setBusy(true);setError('');setResult(null);onHighlights(null);
  const payload={estateId,block,action,mode,question};
  const signature=JSON.stringify(payload);
  // A manual retry of an unchanged request reuses its id. No automatic retry.
  if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  try{const {data}=await api.post('/ai/run',{...payload,requestId:request.current.id});if(epoch.current===current)setResult(data);}
  catch(e){if(epoch.current===current)setError(e.response?.data?.error||'Request did not complete. An unchanged retry will reuse its request ID.');}
  finally{if(epoch.current===current){setBusy(false);refresh().catch(()=>{});}}
 };
 const toggle=async()=>{setBusy(true);setError('');try{await api.patch('/ai/settings',{estateId,enabled:!status.enabled});await refresh();}catch(e){setError(e.response?.data?.error||'Could not update AI switch.');}finally{setBusy(false);}};
 return <section className="estate-ai" aria-label="OBAN AI assistant">
  <div className="ds-heading"><div><div className="eyebrow">OBAN CUSTOMER DEMO</div><h3>Ask. Understand. Plan.</h3><p>Explore the map and explain estate evidence with an AI assistant.</p></div><span className="ai-pill">{mode==='sample'?'Sample · no API cost':'Live AI · metered'}</span></div>
  <div className="ai-service"><div><strong>Live service {status?.enabled&&status?.configured?'on':'paused'}</strong><p>{status?.configured?'Runs only when you send a live request.':'Live service is awaiting server setup. Sample mode is ready.'}</p></div>{status?.canManage&&<button className="button" disabled={busy||(!status.enabled&&!status.configured)} onClick={toggle}>{status.enabled?'Stop live AI':'Turn on live AI'}</button>}</div>
  {status&&<div className="ai-budget"><div><strong>{usd(status.usedUsd)} / US$100</strong><span>{status.month} · UTC monthly application budget</span></div><progress max="100" value={Math.min(status.usedUsd,100)} aria-label="AI application budget used"/><small>Conservative usage charge, including pending and uncertain requests. Reaching the cap stops new live calls. Increasing it requires owner permission.</small></div>}
  <div className="ai-mode" aria-label="AI mode"><button aria-pressed={mode==='sample'} disabled={busy} onClick={()=>setMode('sample')}>Sample walkthrough</button><button aria-pressed={mode==='live'} disabled={busy||!status?.configured} onClick={()=>setMode('live')}>Live AI</button></div>
  <div className="ai-tasks">{tasks.map(t=><button key={t[0]} disabled={busy} aria-pressed={action===t[0]} onClick={()=>changeTask(t)}>{t[1]}</button>)}</div>
  <label className="ai-input">{action==='inspection-note'?'Inspection note':'Your question'}<textarea maxLength="2000" value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)} rows="3"/></label>
  <div className="ds-controls"><button className="button primary" disabled={busy||!status||(mode==='live'&&(!status.enabled||!status.configured||status.usedUsd>=100))} onClick={run}>{busy?'Working…':mode==='sample'?'Show sample':'Send live request'}</button><span className="ds-note">{block||'All OBAN blocks'} · Results and actions are drafts.</span></div>
  {mode==='sample'&&<p className="ds-note">Deterministic walkthrough using dated estate evidence. No AI request is sent, and your question or note is not analysed in sample mode.</p>}
  {error&&<p role="alert" className="production-warning">{error}</p>}
  {result&&<article className="ai-result" aria-live="polite"><div className="ds-heading"><h3>{result.mode==='sample'?'Sample explanation':'AI explanation'}</h3><span className="ds-tag">Production through {result.dataAsOf||'unavailable'}</span></div><p className="ai-answer">{result.answer}</p>{result.actionDrafts.length>0&&<><h4>Action drafts · supervisor review</h4><ul>{result.actionDrafts.map((d,i)=><li key={i}>{d}</li>)}</ul></>}{result.blockCodes.length>0&&<button className="button" onClick={()=>onHighlights({estateId,blockCodes:result.blockCodes,label:`${result.mode==='sample'?'Sample':'AI'} evidence · ${result.dataAsOf}`})}>Highlight {result.blockCodes.join(', ')} on map</button>}<details><summary>Evidence and coverage</summary><p>Ranked sources shown: {result.coverage.rankedSourcesShown} of {result.coverage.eligibleSources}. Forecast coverage is stated in the answer.</p><ul>{result.sources.filter(s=>result.sourceIds.includes(s.id)).map(s=><li key={s.id}>{s.kind} · {s.block||s.period||'Estate'} · {s.date}<small>{s.id}</small></li>)}</ul></details><small>Review against source records before planning field work. No production, map or operation records were changed.</small></article>}
 </section>;
}
