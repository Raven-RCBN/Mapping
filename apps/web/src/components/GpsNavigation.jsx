import {useEffect,useMemo,useRef,useState} from 'react';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import {circular} from 'ol/geom/Polygon';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import {fromLonLat} from 'ol/proj';
import {Style,Fill,Stroke,Circle as CircleStyle} from 'ol/style';
import {navigationTo,startGps,validCoordinate} from '../../../../packages/shared/gps-navigation.js';
export default function GpsNavigation({mapRef,blockDestination,estateKey}){
 const [active,setActive]=useState(false),[fix,setFix]=useState(null),[error,setError]=useState(''),[follow,setFollow]=useState(true),[destination,setDestination]=useState(null),[expanded,setExpanded]=useState(false),[now,setNow]=useState(Date.now()),[lat,setLat]=useState(''),[lon,setLon]=useState('');
 const firstFix=useRef(true),lastFollow=useRef(0);
 useEffect(()=>{setDestination(null);},[estateKey]);
 useEffect(()=>{
  if(!active)return;let stop;
  try{stop=startGps(navigator.geolocation,f=>{setFix(f);setNow(Date.now());setError('');},setError);}catch(e){setError(e.message);setActive(false);}
  const tick=setInterval(()=>setNow(Date.now()),5000);
  return()=>{stop?.();clearInterval(tick);};
 },[active]);
 const stale=!!fix&&now-fix.timestamp>30000;
 const direction=useMemo(()=>fix&&destination&&!stale?navigationTo(fix,destination):null,[fix,destination,stale]);
 useEffect(()=>{
  const map=mapRef.current;if(!map)return;
  const features=[];
  if(fix){
   const centre=fromLonLat([fix.longitude,fix.latitude]);
   const accuracy=new Feature(circular([fix.longitude,fix.latitude],Math.min(fix.accuracy,100000),64).transform('EPSG:4326','EPSG:3857'));
   accuracy.setStyle(new Style({fill:new Fill({color:stale?'rgba(100,116,139,0.15)':'rgba(37,99,235,0.14)'}),stroke:new Stroke({color:stale?'#64748b':'#2563eb',width:1})}));features.push(accuracy);
   const point=new Feature(new Point(centre));point.setStyle(new Style({image:new CircleStyle({radius:8,fill:new Fill({color:stale?'#64748b':'#2563eb'}),stroke:new Stroke({color:'#fff',width:3})})}));features.push(point);
   if(follow&&!stale&&Date.now()-lastFollow.current>800){lastFollow.current=Date.now();map.getView().animate({center:centre,...(firstFix.current?{zoom:Math.max(16,map.getView().getZoom()||16)}:{}),duration:250});firstFix.current=false;}
   if(destination&&!stale){const line=new Feature(new LineString([centre,fromLonLat([destination.longitude,destination.latitude])]));line.setStyle(new Style({stroke:new Stroke({color:'#2563eb',width:3,lineDash:[8,6]})}));features.push(line);}
  }
  if(destination){const marker=new Feature(new Point(fromLonLat([destination.longitude,destination.latitude])));marker.setStyle(new Style({image:new CircleStyle({radius:9,fill:new Fill({color:'#f59e0b'}),stroke:new Stroke({color:'#fff',width:3})})}));features.push(marker);}
  const source=new VectorSource({features}),layer=new VectorLayer({source,zIndex:55});map.addLayer(layer);
  return()=>{map.removeLayer(layer);layer.dispose();source.dispose();};
 },[fix,destination,follow,stale,mapRef]);
 useEffect(()=>{const map=mapRef.current;if(!map)return;const pause=()=>setFollow(false);map.on('pointerdrag',pause);return()=>map.un('pointerdrag',pause);},[mapRef,active]);
 function start(){setExpanded(true);setError('');firstFix.current=true;setFollow(true);setActive(true);}
 function stop(){setActive(false);setFix(null);setDestination(null);setError('');}
 return <section className={`gps-navigation ${expanded?'expanded':''}`} aria-label="GPS navigation">
  <div className="gps-header"><button className="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>⌖ GPS {active?(stale?'· stale fix':fix?'· on':'· locating'):''}</button>{!active&&<button className="button" onClick={start}>Locate me</button>}{active&&<button className="button" onClick={stop}>Stop GPS</button>}</div>
  {expanded&&<div className="gps-body">
   {error&&<p role="status">{error}</p>}
   {fix?<><p><strong>{fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)}</strong><br/>Accuracy ±{Math.round(fix.accuracy)} m · {stale?'Last fix is over 30 seconds old':`Updated ${new Date(fix.timestamp).toLocaleTimeString()}`}</p><p>{fix.speed!=null?`${(fix.speed*3.6).toFixed(1)} km/h · `:''}{fix.heading!=null?`Movement heading ${Math.round(fix.heading)}°`:''}{fix.altitude!=null?` · Altitude ${Math.round(fix.altitude)} m`:''}</p><label><input type="checkbox" checked={follow} onChange={e=>{firstFix.current=true;setFollow(e.target.checked);}}/> Follow my position</label></>:<p>{active?'Waiting for device GPS…':'Tap Locate me and allow location access.'}</p>}
   {blockDestination&&<button className="button" onClick={()=>{setDestination(blockDestination);if(!active)start();}}>Navigate to {blockDestination.label}</button>}
   <details><summary>Enter destination coordinates</summary><form onSubmit={e=>{e.preventDefault();const latitude=Number(lat),longitude=Number(lon);if(!lat.trim()||!lon.trim()||!validCoordinate(latitude,longitude)){setError('Enter latitude −90 to 90 and longitude −180 to 180.');return;}setDestination({latitude,longitude,label:'Entered coordinates'});if(!active)start();}}><label>Latitude<input type="number" step="any" required min="-90" max="90" value={lat} onChange={e=>setLat(e.target.value)}/></label><label>Longitude<input type="number" step="any" required min="-180" max="180" value={lon} onChange={e=>setLon(e.target.value)}/></label><button className="button">Navigate</button></form></details>
   {destination&&<div className="gps-destination"><strong>{destination.label}</strong>{direction?<p>{direction.distance>=1000?(direction.distance/1000).toFixed(2)+' km':Math.round(direction.distance)+' m'} direct distance · {direction.bearing==null?'At destination coordinates':Math.round(direction.bearing)+'° true bearing'}</p>:<p>A fresh GPS fix is needed for distance and bearing.</p>}{destination.approximate&&<p>Approximate block label position from a PDF; verify in the field.</p>}<button className="button" onClick={()=>setDestination(null)}>Stop navigation</button></div>}
   <small>Direct guidance does not follow roads or account for rivers, fences or terrain. Keep the app open. GPS fixes are not saved to your MapIntel account.</small>
  </div>}
 </section>;
}
