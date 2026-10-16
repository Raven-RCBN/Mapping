import fs from 'node:fs/promises';
import path from 'node:path';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
export function installYieldModel(api,models,config){
 api.get('/yield-model',async(req,res)=>{
  const estateId=String(req.query.estateId||'');
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(estateId))throw new QueryError('Select an estate',400);
  if(!canAccess(req,estateId))throw new QueryError('Estate access denied',403);
  if(!await models.Estate.exists({_id:estateId}))throw new QueryError('Estate not found',404);
  res.set('Cache-Control','private, no-store');
  let data;try{data=JSON.parse(await fs.readFile(path.join(config.dataDir,'yield-models',estateId+'.json'),'utf8'));}
  catch(e){if(e.code==='ENOENT')return res.json({status:'unavailable',message:'A trained yield model is not available for this estate yet.'});throw e;}
  if(data.estateId!==estateId||data.version!==1||!Array.isArray(data.forecasts)||!Array.isArray(data.horizons))throw new QueryError('Model snapshot could not be verified',409);
  try{
   const experiment=JSON.parse(await fs.readFile(path.join(config.dataDir,'yield-models',estateId+'.experimental.json'),'utf8'));
   if(experiment.version===1&&experiment.estateId===estateId&&experiment.status==='experimental'&&experiment.horizonMonths===1&&Array.isArray(experiment.forecasts))data.experimental=experiment;
  }catch(e){if(e.code!=='ENOENT')console.error('Experimental yield snapshot unavailable');}
  res.json(data);
 });
}
