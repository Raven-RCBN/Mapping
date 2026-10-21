import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError,SummaryCache} from './performance.js';

const query=z.object({estateId:z.string().regex(/^[\w-]{1,100}$/),work:z.enum(['harvester','circle_spraying','grabber_truck','tractor_slasher']).default('harvester'),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default('2026-01'),date:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/).optional(),block:z.string().max(100).default(''),section:z.enum(['all','metadata','view','layer']).default('all'),page:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(100).default(50)});
const metadata=data=>({summary:data.summary,blocks:data.blocks,contexts:data.contexts,months:[...new Set(data.summary.monthly_comparison.map(r=>r.month))]});
export function selectMovement(data,q){
 const inPeriod=r=>q.date?r.date===q.date:r.month===q.month;
 const movements=data.dailyRecords.filter(r=>r.work===q.work&&(q.date?r.local_date===q.date:r.month===q.month)&&(!q.block||r.block===q.block));
 const page=q.page||0,limit=q.limit||50;
 return {...metadata(data),dates:[...new Set(data.dailyRecords.filter(r=>r.work===q.work&&r.month===q.month&&(!q.block||r.block===q.block)).map(r=>r.local_date))].sort(),coverage:(q.date?data.dailyCoverage:data.coverage).filter(r=>r.work===q.work&&inPeriod(r)&&(!q.block||r.block===q.block)),comparison:(q.date?data.dailyComparison:data.comparison).filter(r=>inPeriod(r)&&(!q.block||r.iot_block===q.block)),movements:movements.slice(page*limit,(page+1)*limit),movementCount:movements.length,page,limit};
}
export function installIotMovement(api,models,{dataDir=process.env.DATA_DIR||path.resolve('data')}={}){
 // Bounded caches are private to this API instance. Access is checked on every request.
 const cache=new SummaryCache({ttl:60000,maxBytes:32*1024*1024,maxEntries:32}),pending=new Map();
 const read=async file=>{const hit=cache.get(file);if(hit)return hit;if(pending.has(file))return pending.get(file);const task=fs.readFile(file,'utf8').then(s=>cache.set(file,JSON.parse(s))).finally(()=>pending.delete(file));pending.set(file,task);return task;};
 api.get('/iot-movement',async(req,res)=>{
  const q=query.parse(req.query);
  if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);
  if(q.date&&(!q.date.startsWith(q.month+'-')||Number.isNaN(Date.parse(q.date))||new Date(q.date).toISOString().slice(0,10)!==q.date))throw new QueryError('Date must be a valid date within the selected month');
  if(!await models.Estate.findById(q.estateId).select('_id').lean())throw new QueryError('Estate not found',404);
  res.set('Cache-Control','private, no-store');
  const folder=path.join(dataDir,'estates',q.estateId,'iot-movement');
  let data;
  try{
   let manifest;try{manifest=await read(path.join(folder,'pages','manifest.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(manifest){
    if(manifest.version!==1||!/^[a-f0-9]{64}$/.test(manifest.generation))throw new QueryError('Invalid movement dataset manifest',500);
    const dir=path.join(folder,'pages',manifest.generation),meta=await read(path.join(dir,'metadata.json'));
    let period={dailyRecords:[],coverage:[],dailyCoverage:[],comparison:[],dailyComparison:[]};
    if(q.section!=='metadata'&&q.section!=='layer')try{period=await read(path.join(dir,q.work+'-'+q.month+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    data={...meta,...period};
   }else data=await read(path.join(folder,'index.json'));
  }catch(e){if(e.code==='ENOENT')return res.json({available:false,estateId:q.estateId});throw e;}
  const base={available:true,estateId:q.estateId};
  if(q.section==='metadata')return res.json({...base,...metadata(data)});
  if(q.section==='view'){const {summary,blocks,contexts,months,...view}=selectMovement(data,q);return res.json({...base,...view});}
  let layer=null;try{layer=await read(path.join(folder,'layers',q.work+'-'+(q.date||q.month)+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(q.section==='layer')return res.json({...base,layer});
  res.json({...base,...selectMovement(data,q),layer});
 });
}
