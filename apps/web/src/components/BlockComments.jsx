import {useEffect,useState} from 'react';
import {api} from '../api';
export default function BlockComments({estateId,code,offline,table=false,role,onMap}) {
  const [rows,setRows]=useState([]),[names,setNames]=useState([]),[year,setYear]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[edit,setEdit]=useState(null),[saving,setSaving]=useState(false),[query,setQuery]=useState('');
  useEffect(()=>{
    if(offline){setBusy(false);return;}
    const c=new AbortController();setBusy(true);setError('');setRows([]);
    api.get('/production/comments',{params:{estateId,mapBlockCode:code||undefined},signal:c.signal}).then(({data})=>{
      setRows(data.items);const years=[...new Set(data.items.map(r=>String(r.year)))].sort().reverse();setYear(y=>years.includes(y)?y:years[0]||'');setBusy(false);
    }).catch(e=>{if(e.code!=='ERR_CANCELED'){setError(e.response?.data?.error||e.message);setBusy(false);}});
    if(table)api.get('/production/meta',{params:{estateId},signal:c.signal}).then(({data})=>setNames(data.names)).catch(e=>{if(e.code!=='ERR_CANCELED')setError(e.response?.data?.error||e.message);});
    return()=>c.abort();
  },[estateId,code,offline,table,refresh]);
  const years=[...new Set(rows.map(r=>String(r.year)))].sort().reverse(),chosen=rows.filter(r=>String(r.year)===year&&(!query||[r.sourceBlockCode,r.division,r.mapBlockCode,r.comment].join(' ').toLowerCase().includes(query.toLowerCase())));
  const canWrite=table&&['admin','manager'].includes(role);
  const save=async e=>{e.preventDefault();setSaving(true);setError('');try{
    const record={sourceBlockId:edit.sourceBlockId,year:Number(edit.year),comment:edit.comment,sourceSystem:'manual'};
    await api[edit.id?'patch':'post']('/production/comments'+(edit.id?'/'+edit.id:''),{estateId,revision:edit.revision||0,record});setYear(String(edit.year));setEdit(null);setRefresh(n=>n+1);
  }catch(e){setError(e.response?.data?.error||e.message);}finally{setSaving(false);}};
  return <section className={table?'production-tables':'block-comments'} aria-label="Block comments">
    <div className="production-heading"><h3>{table?'Block comments':`Comments · ${code}`}</h3>{years.length>0&&<label>Comment year<select value={year} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label>}</div>
    {table&&<div className="production-controls"><label>Search comments<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>{canWrite&&<button className="button" disabled={!names.length} onClick={()=>setEdit({sourceBlockId:names[0]?.id,year:year||new Date().getFullYear(),comment:''})}>Add block comment</button>}<button className="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh comments</button></div>}
    {offline?<p>Connect to view block comments.</p>:busy?<p role="status">Loading comments…</p>:null}
    {error&&<p role="alert">{error}</p>}
    {edit&&<form className="production-editor" onSubmit={save}><div className="production-form-grid"><label>Source block<select required disabled={!!edit.id} value={edit.sourceBlockId} onChange={e=>setEdit({...edit,sourceBlockId:e.target.value})}>{names.map(n=><option key={n.id} value={n.id}>{n.sourceBlockCode} · {n.division} → {n.mapBlockCode||'Unmapped'}</option>)}</select></label><label>Comment year<input required type="number" min="1900" max="2200" disabled={!!edit.id} value={edit.year} onChange={e=>setEdit({...edit,year:e.target.value})}/></label><label className="wide">Comment<textarea required maxLength="4000" value={edit.comment} onChange={e=>setEdit({...edit,comment:e.target.value})}/></label></div><button className="button primary" disabled={saving}>Save comment</button><button className="button" type="button" onClick={()=>setEdit(null)}>Cancel</button></form>}
    {!busy&&!offline&&!error&&(chosen.length?table?<div className="data-table-scroll"><table className="analytics-results"><thead><tr><th>Year</th><th>Original block / group</th><th>Map block</th><th>Comment</th><th>Source</th><th>Actions</th></tr></thead><tbody>{chosen.map(r=><tr key={r.id}><td>{r.year}</td><td>{r.sourceBlockCode} · {r.division}</td><td>{r.mapBlockCode||'Unmapped'}</td><td className="block-comment-text">{r.comment}</td><td>{r.sourceSheet} {r.sourceCell}</td><td>{canWrite&&<button className="text-button" onClick={()=>setEdit(r)}>Edit</button>}{r.mapBlockCode&&<button className="text-button" onClick={()=>onMap?.({estateId,blockCode:r.mapBlockCode})}>Map</button>}</td></tr>)}</tbody></table></div>:chosen.map(r=><article key={r.id}><strong>{r.sourceBlockCode} · {r.division} · {r.year}</strong><p className="block-comment-text">{r.comment}</p></article>):<p>No comment supplied{code?' for this block':''}{year?` in ${year}`:''}.</p>)}
  </section>;
}
