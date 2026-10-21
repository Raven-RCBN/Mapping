import {useEffect,useRef,useState} from 'react';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import {transformExtent} from 'ol/proj';
import {authorisedFile} from '../api';

// Memory-only, component-scoped cache: switching analyses must not download the
// same authenticated survey image again. It disappears when the map unmounts.
export default function useSurveyOverlay(mapRef,asset,offline){
 const cache=useRef(new Map()),[status,setStatus]=useState(''),[retry,setRetry]=useState(0);
 const url=asset?.url,bounds=JSON.stringify(asset?.bounds||null);
 useEffect(()=>{
  const map=mapRef.current;if(!map||!url||offline){setStatus('');return;}
  let cancelled=false,layer,objectUrl;
  setStatus('loading');
  const previewUrl=url+(url.includes('?')?'&':'?')+'preview=1';
  let request=cache.current.get(previewUrl);
  if(!request){
   request=authorisedFile(previewUrl).catch(error=>{cache.current.delete(previewUrl);throw error;});
   cache.current.set(previewUrl,request);
   while(cache.current.size>4)cache.current.delete(cache.current.keys().next().value);
  }
  request.then(blob=>{
   if(cancelled)return;
   const b=JSON.parse(bounds),extent=transformExtent([b[0][1],b[0][0],b[1][1],b[1][0]],'EPSG:4326','EPSG:3857');
   objectUrl=URL.createObjectURL(blob);
   const source=new ImageStatic({url:objectUrl,imageExtent:extent,projection:'EPSG:3857'});
   source.on('imageloadend',()=>{if(!cancelled){setStatus('ready');map.render();}});
   source.on('imageloaderror',()=>{if(!cancelled){cache.current.delete(previewUrl);setStatus('error');}});
   layer=new ImageLayer({source,zIndex:18,opacity:0.9});map.addLayer(layer);
   map.render();
  }).catch(()=>{if(!cancelled)setStatus('error');});
  return()=>{cancelled=true;if(layer){map.removeLayer(layer);layer.dispose();}if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[mapRef,url,bounds,offline,retry]);
 return {status,retry:()=>{if(url)cache.current.delete(url+(url.includes('?')?'&':'?')+'preview=1');setRetry(n=>n+1);}};
}
