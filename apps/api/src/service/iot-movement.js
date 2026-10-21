import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';

const query=z.object({estateId:z.string().regex(/^[\w-]{1,100}$/),work:z.enum(['harvester','circle_spraying','grabber_truck','tractor_slasher']).default('harvester'),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default('2026-01'),date:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/).optional(),block:z.string().max(100).default('')});
export function selectMovement(data,q){
 const inPeriod=r=>q.date?r.date===q.date:r.month===q.month;
 return {summary:data.summary,blocks:data.blocks,contexts:data.contexts,months:data.summary.monthly_comparison.map(r=>r.month),dates:[...new Set(data.dailyRecords.filter(r=>r.work===q.work&&r.month===q.month&&(!q.block||r.block===q.block)).map(r=>r.local_date))].sort(),coverage:(q.date?data.dailyCoverage:data.coverage).filter(r=>r.work===q.work&&inPeriod(r)&&(!q.block||r.block===q.block)),comparison:(q.date?data.dailyComparison:data.comparison).filter(r=>inPeriod(r)&&(!q.block||r.iot_block===q.block)),movements:data.dailyRecords.filter(r=>r.work===q.work&&(q.date?r.local_date===q.date:r.month===q.month)&&(!q.block||r.block===q.block))};
}
export function installIotMovement(api,models,{dataDir=process.env.DATA_DIR||path.resolve('data')}={}){
 const cache=new Map();
 api.get('/iot-movement',async(req,res)=>{
  const q=query.parse(req.query);
  if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);
  if(q.date&&(!q.date.startsWith(q.month+'-')||Number.isNaN(Date.parse(q.date))||new Date(q.date).toISOString().slice(0,10)!==q.date))throw new QueryError('Date must be a valid date within the selected month');
  if(!await models.Estate.findById(q.estateId).select('_id').lean())throw new QueryError('Estate not found',404);
  res.set('Cache-Control','private, no-store');
  const folder=path.join(dataDir,'estates',q.estateId,'iot-movement');
  let data=cache.get(q.estateId);
  if(!data){try{data=JSON.parse(await fs.readFile(path.join(folder,'index.json'),'utf8'));cache.set(q.estateId,data);}catch(e){if(e.code==='ENOENT')return res.json({available:false,estateId:q.estateId});throw e;}}
  const result=selectMovement(data,q);let layer=null;
  try{layer=JSON.parse(await fs.readFile(path.join(folder,'layers',q.work+'-'+(q.date||q.month)+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  res.json({available:true,estateId:q.estateId,...result,layer});
 });
}
