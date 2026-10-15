import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Provider} from 'react-redux';
import {store,loaded,patch} from '../src/store';
import MapView from '../src/components/MapView';
import HTSAnalysis from '../src/components/HTSAnalysis';
import AnalyticsDashboard from '../src/components/AnalyticsDashboard';
import {api} from '../src/api';
import '../src/style.css';
const estateId='f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae';
function Preview(){
 const [mapReady,setMapReady]=useState(false),[highlights,setHighlights]=useState(null);
 const mapPreview=new URLSearchParams(location.search).get('view')==='map';
 const [selection,setSelection]=useState(estateId+'::F13'),[boundary,setBoundary]=useState(null);
 const yieldPreview=new URLSearchParams(location.search).get('view')==='yield';
 useEffect(()=>{if(yieldPreview||mapPreview)api.get('/workspace',{params:{estates:estateId}}).then(({data})=>{setBoundary(data.estates.find(e=>e.id===estateId)?.boundary);if(mapPreview){store.dispatch(loaded({...data,activities:[],assets:[],paged:false,offline:false}));setMapReady(true);}});},[yieldPreview,mapPreview]);
 useEffect(()=>mapReady?store.subscribe(()=>setSelection(store.getState().selectedBlock||'')):undefined,[mapReady]);
 const noop=useCallback(()=>{},[]),choose=useCallback(code=>{setSelection(code?estateId+'::'+code:'');if(mapPreview)store.dispatch(patch({selectedBlock:code?estateId+'::'+code:null}));},[mapPreview]);
 return <main style={{maxWidth:1500,margin:'0 auto',padding:'24px 16px'}}><div style={{background:'#fff8e8',border:'1px solid #ead5a3',padding:'12px 16px',borderRadius:8,marginBottom:18}}>Local preview · Oban Nigeria · rainfall through September 2026</div>{mapPreview&&mapReady&&<Provider store={store}><MapView rows={[]} analyticsHighlights={highlights} onImport={()=>{}} onOffline={()=>{}}/></Provider>}{yieldPreview?<AnalyticsDashboard estateId={estateId} boundary={boundary} enabled={true} offline={false} selection={selection} onBlockChange={choose} onSelect={choose} onHighlights={noop} onMap={noop}/>:<HTSAnalysis estateId={estateId} selection={selection} onBlockChange={choose} onSelect={choose} onHighlights={mapPreview?setHighlights:noop}/>}</main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
