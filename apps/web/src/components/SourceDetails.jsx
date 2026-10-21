import './SourceDetails.css';
import {useState} from 'react';
import {api} from '../api';
import {useAccess} from '../useAccess';
const fields=[['profileVersion','Profile version'],['connectionDetails','Connection / credential reference'],['extractionMethod','Extraction method and queries'],['reviewNotes','Validation, matching and review notes']];
export default function SourceDetails({source,onReload,offline}){
 const {can}=useAccess(source.estateId),[editing,setEditing]=useState(false),[draft,setDraft]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const hasDetails=fields.some(([k])=>source[k]);
 return <details className="source-details"><summary>Connection and extraction details{source.profileVersion?' · '+source.profileVersion:''}</summary>
 {editing?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api.patch('/sources/'+source.id+'/details',{detailsRevision:source.detailsRevision||0,details:draft});await onReload();setEditing(false);}catch(e){setError(e.response?.data?.error||e.message);}finally{setBusy(false);}}}>
 {fields.map(([k,label])=><label key={k}>{label}<textarea rows={k==='extractionMethod'?12:4} maxLength={k==='profileVersion'?100:40000} value={draft[k]} onChange={e=>setDraft({...draft,[k]:e.target.value})}/></label>)}
 <p>Document the route and credential reference. Keep secret values in the protected server environment.</p><button className="button primary" disabled={busy}>Save details</button><button type="button" className="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></form>:<>{hasDetails?fields.filter(([k])=>source[k]).map(([k,label])=><section key={k}><h4>{label}</h4><pre>{source[k]}</pre></section>):<p>No connection or extraction guide has been saved.</p>}{!offline&&can('sources','edit')&&<button className="button" onClick={()=>{setDraft(Object.fromEntries(fields.map(([k])=>[k,source[k]||''])));setEditing(true);setError('');}}>Edit source details</button>}</>}
 {error&&<p role="alert">{error}</p>}</details>;
}
