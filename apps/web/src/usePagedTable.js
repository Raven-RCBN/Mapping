import {useEffect,useState} from 'react';
import {api} from './api';
// A scope change invalidates both data and cursor history synchronously, before effects run.
export function usePagedTable(endpoint,params,{enabled=true}={}){
 const scope=JSON.stringify([endpoint,params]),[nav,setNav]=useState({scope:null,page:0,cursors:[null]}),[response,setResponse]=useState(null),[failure,setFailure]=useState(null),[revision,setRevision]=useState(0);
 const page=nav.scope===scope?nav.page:0,cursors=nav.scope===scope?nav.cursors:[null],cursor=cursors[page];
 const requestKey=JSON.stringify([scope,cursor,revision]);
 const data=response?.key===requestKey?response.data:null,error=failure?.key===requestKey?failure.message:'';
 useEffect(()=>{
  if(!enabled)return;const c=new AbortController();let active=true;
  const timer=setTimeout(()=>api.get(endpoint,{params:{...params,cursor:cursor||undefined,limit:25},signal:c.signal}).then(({data})=>{if(active)setResponse({key:requestKey,data})}).catch(e=>{if(active&&e.code!=='ERR_CANCELED')setFailure({key:requestKey,message:e.response?.data?.error||e.message})}),180);
  return()=>{active=false;clearTimeout(timer);c.abort()};
 },[requestKey,enabled]);
 const reset=()=>{setNav({scope,page:0,cursors:[null]});setRevision(n=>n+1)};
 return {data,error,loading:enabled&&!data&&!error,page,next:()=>{if(data?.nextCursor)setNav({scope,page:page+1,cursors:[...cursors.slice(0,page+1),data.nextCursor]})},previous:()=>{if(page>0)setNav({scope,page:page-1,cursors})},reset,retry:()=>setRevision(n=>n+1)};
}
