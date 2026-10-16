import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
export function estateCentre(boundary){
 const points=[];const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&typeof v[0]==='number'&&typeof v[1]==='number'){if(Number.isFinite(v[0])&&Number.isFinite(v[1])&&Math.abs(v[0])<=180&&Math.abs(v[1])<=90)points.push(v);}else v.forEach(walk);};
 for(const f of boundary?.features||[])walk(f.geometry?.coordinates);
 if(!points.length)return null;
 const bounds=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
 return {latitude:(bounds[1]+bounds[3])/2,longitude:(bounds[0]+bounds[2])/2};
}
export function installDecisionWeather(api,models,{fetcher=fetch,key=process.env.OPEN_METEO_API_KEY}={}){
 const cache=new Map();
 api.get('/decision-weather',async(req,res)=>{
  const estateId=String(req.query.estateId||'');if(!/^[a-zA-Z0-9-]{1,80}$/.test(estateId))throw new QueryError('Select an estate',400);
  if(!canAccess(req,estateId))throw new QueryError('Estate access denied',403);
  const estate=await models.Estate.findById(estateId).select('boundary').lean();if(!estate)throw new QueryError('Estate not found',404);
  res.set('Cache-Control','private, no-store');
  if(!key)return res.json({status:'not_configured',message:'Weather connection is not configured. Add a commercial Open-Meteo API key on the server.'});
  const centre=estateCentre(estate.boundary);if(!centre)return res.json({status:'unavailable',message:'Estate coordinates are unavailable.'});
  const cacheKey=JSON.stringify([estateId,centre]),cached=cache.get(cacheKey);if(cached&&Date.now()-cached.at<1800000)return res.json(cached.data);
  const url=new URL('https://customer-api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({...centre,apikey:key,forecast_days:'7',timezone:'auto',daily:'precipitation_sum,precipitation_probability_max,temperature_2m_max,wind_speed_10m_max'}).toString();
  try{
   const response=await fetcher(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Weather provider unavailable');
   const payload=await response.json(),d=payload.daily;if(!Array.isArray(d?.time)||!d.time.length)throw Error('Missing forecast');
   const number=v=>Number.isFinite(v)?v:null;
   const data={status:'ready',updatedAt:new Date().toISOString(),timezone:payload.timezone,...centre,days:d.time.map((date,i)=>({date,rainMm:number(d.precipitation_sum?.[i]),rainProbability:number(d.precipitation_probability_max?.[i]),temperatureC:number(d.temperature_2m_max?.[i]),windKmh:number(d.wind_speed_10m_max?.[i])}))};
   if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(cacheKey,{at:Date.now(),data});res.json(data);
  }catch{res.status(502).json({error:'Weather could not be refreshed. Try again later.'});}
 });
}
