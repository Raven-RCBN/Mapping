import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import HTSAnalysis from '../src/components/HTSAnalysis';
import AnalyticsDashboard from '../src/components/AnalyticsDashboard';
import {api} from '../src/api';
import '../src/style.css';
const estateId='f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae';
function Preview(){
 const [selection,setSelection]=useState(estateId+'::F13'),[boundary,setBoundary]=useState(null);
 const yieldPreview=new URLSearchParams(location.search).get('view')==='yield';
 useEffect(()=>{if(yieldPreview)api.get('/workspace',{params:{estates:estateId}}).then(({data})=>setBoundary(data.estates.find(e=>e.id===estateId)?.boundary));},[yieldPreview]);
 const noop=useCallback(()=>{},[]),choose=useCallback(code=>setSelection(code?estateId+'::'+code:''),[]);
 return <main style={{maxWidth:1500,margin:'0 auto',padding:'24px 16px'}}><div style={{background:'#fff8e8',border:'1px solid #ead5a3',padding:'12px 16px',borderRadius:8,marginBottom:18}}>Local preview · Oban Nigeria · rainfall through September 2026</div>{yieldPreview?<AnalyticsDashboard estateId={estateId} boundary={boundary} enabled={true} offline={false} selection={selection} onBlockChange={choose} onSelect={choose} onHighlights={noop} onMap={noop}/>:<HTSAnalysis estateId={estateId} selection={selection} onBlockChange={choose} onSelect={choose} onHighlights={noop}/>}</main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
