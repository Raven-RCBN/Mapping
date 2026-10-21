import {useEffect,useRef,useState} from 'react';
import {api} from './api';
// Component-local, short-lived reuse only; never persisted or shared across users.
export function useIotResource(params,enabled=true){
 const key=JSON.stringify(params),cache=useRef(new Map()),[result,setResult]=useState(null),[failure,setFailure]=useState(null);
 const hit=cache.current.get(key),data=enabled?(result?.key===key?result.data:hit?.until>Date.now()?hit.data:null):null;
 const error=enabled&&failure?.key===key?failure.message:'';
 useEffect(()=>{
  if(!enabled)return;
  const old=cache.current.get(key);if(old?.until>Date.now()){setResult({key,data:old.data});return;}
  const c=new AbortController();api.get('/iot-movement',{params,signal:c.signal}).then(({data})=>{if(c.signal.aborted)return;cache.current.delete(key);while(cache.current.size>=6)cache.current.delete(cache.current.keys().next().value);cache.current.set(key,{data,until:Date.now()+60000});setResult({key,data});setFailure(null)}).catch(e=>{if(!c.signal.aborted)setFailure({key,message:e.response?.data?.error||'Could not load movement records.'})});
  return()=>c.abort();
 },[key,enabled]);
 return {data,error,loading:enabled&&!data&&!error};
}
