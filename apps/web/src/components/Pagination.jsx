import {useEffect,useState} from 'react';
export function usePagination(rows,resetKey,pageSize=25){
 const [selection,setSelection]=useState({key:resetKey,page:0});
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));
 const page=selection.key===resetKey?Math.min(selection.page,pages-1):0;
 useEffect(()=>{setSelection({key:resetKey,page:0});},[resetKey]);
 return {items:rows.slice(page*pageSize,(page+1)*pageSize),page,pages,total:rows.length,pageSize,setPage:p=>setSelection({key:resetKey,page:p})};
}
export function PageControls({pagination:p,label}){
 if(!p.total)return null;
 return <nav className="table-pagination" aria-label={`${label} pagination`}><button className="button" disabled={p.page===0} onClick={()=>p.setPage(p.page-1)}>Previous</button><span>{p.page*p.pageSize+1}–{Math.min((p.page+1)*p.pageSize,p.total)} of {p.total} · Page {p.page+1} of {p.pages}</span><button className="button" disabled={p.page+1>=p.pages} onClick={()=>p.setPage(p.page+1)}>Next</button></nav>;
}
