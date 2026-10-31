import RecordActions from './RecordActions';
import {useRef,useState} from 'react';
import {api} from '../api';
import {useAccess} from '../useAccess';
import './EstateWorkbook.css';
export default function EstateWorkbook({estateId,tab}) {
 const {can}=useAccess(estateId),input=useRef();
 const [busy,setBusy]=useState(''),[preview,setPreview]=useState(null),[error,setError]=useState(''),[saved,setSaved]=useState(null);
 const message=async e=>{const data=e.response?.data;if(data instanceof Blob){try{return JSON.parse(await data.text()).error;}catch{return 'Could not download the workbook.';}}return data?.error||e.message;};
 const download=async()=>{
  setBusy('download');setError('');
  try{const r=await api.get('/estate-workbook/template',{params:{estateId},responseType:'blob'}),url=URL.createObjectURL(r.data),a=document.createElement('a');a.href=url;a.download=/filename="?([^";]+)"?/.exec(r.headers['content-disposition']||'')?.[1]||`${estateId}-data-template.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(await message(e));}finally{setBusy('');}
 };
 const upload=async file=>{
  if(!file)return;setPreview(null);setSaved(null);setError('');
  if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>5*1024*1024){setError('Choose an .xlsx template up to 5 MB.');return;}
  setBusy('upload');
  try{const form=new FormData();form.append('workbook',file);const {data}=await api.post('/estate-workbook/preview',form,{params:{estateId}});setPreview(data);}catch(e){setError(await message(e));}finally{setBusy('');input.current.value='';}
 };
 const apply=async()=>{
  setBusy('apply');setError('');
  try{const {data}=await api.post('/estate-workbook/apply',{estateId,token:preview.token});setSaved(data.saved);setPreview(null);}catch(e){setError(await message(e));setPreview(null);}finally{setBusy('');}
 };
 return <section className="estate-workbook" aria-label="Estate Excel templates">
  <div className="estate-workbook-toolbar"><div><strong>Estate Excel template</strong><p>{estateId?'All available data tabs · 2 sample rows per tab · selected estate only':'Select one estate to download or upload its template.'}</p></div><div className="estate-workbook-actions">
   <button disabled={!estateId||!!busy} onClick={download}>{busy==='download'?'Preparing Excel…':'↓ Download Excel template'}</button>
   {can('imports','add')&&<><button disabled={!estateId||!!busy} onClick={()=>input.current.click()}>{busy==='upload'?'Checking workbook…':'↑ Upload Excel'}</button><input ref={input} type="file" accept=".xlsx" hidden aria-label="Upload estate Excel workbook" onChange={e=>upload(e.target.files[0])}/></>}
   <RecordActions manage kind={tab} estateId={estateId}/>
  </div></div>
  {error&&<p role="alert" className="estate-workbook-error">{error}</p>}
  {saved!==null&&<p role="status">Saved {saved} records. <button onClick={()=>window.location.reload()}>Refresh data tables</button></p>}
  {preview&&<div className="estate-workbook-preview" aria-live="polite"><h3>Review upload — {preview.estateName}</h3><p>{preview.changes} records to save. {preview.samples} sample rows skipped. Nothing has been saved yet.</p>
   {!!preview.summary.length&&<table><thead><tr><th>Table</th><th>New</th><th>Updates</th><th>Unchanged</th></tr></thead><tbody>{preview.summary.map(s=><tr key={s.sheet}><td>{s.sheet}</td><td>{s.add}</td><td>{s.update}</td><td>{s.unchanged}</td></tr>)}</tbody></table>}
   {!!preview.errors.length&&<><p role="alert">Fix {preview.errors.length} errors and upload again:</p><ul className="estate-workbook-errors">{preview.errors.map((e,i)=><li key={i}>{e.sheet}, row {e.row}: {e.message}</li>)}</ul></>}
   {!preview.errors.length&&!preview.changes&&<p>No updates to apply. Replace the examples with your estate data and set Row type to DATA.</p>}
   <div className="estate-workbook-actions"><button disabled={!!busy||!preview.token||!preview.changes||!!preview.errors.length} onClick={apply}>{busy==='apply'?'Saving…':`Apply ${preview.changes} updates`}</button><button disabled={!!busy} onClick={()=>setPreview(null)}>Cancel</button></div>
   <small>Preview expires after 15 minutes. Blank optional cells preserve existing values.</small>
  </div>}
 </section>;
}
