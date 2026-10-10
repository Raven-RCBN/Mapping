import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canAccess, requireWrite} from './auth.js';
import {QueryError} from './performance.js';
import {allocateWages} from '../../../../packages/shared/wages.js';

const id=z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
const label=z.string().trim().min(1).max(200);
export const wageInput=z.object({
  basis:z.enum(['monthly','annual_summary']), period:z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/),
  division:label, task:label, activity:label,
  sourceBlockCode:label.nullable().default(null), mapBlockCode:label.nullable().default(null),
  amountMinor:z.number().int().min(-1e13).max(1e13), currency:z.literal('NGN'),
  sourceSystem:label, sourceKey:z.string().trim().min(1).max(300),
  sourceDivision:z.string().max(200).optional(), sourceSerial:z.string().max(100).optional(),
  sourceFile:z.string().max(300).optional(), sourceSheet:z.string().max(100).optional(),
  sourceRow:z.number().int().positive().optional(), sourceCell:z.string().max(100).optional(),
  sourceHash:z.string().regex(/^[a-f0-9]{64}$/).optional(), note:z.string().max(4000).default(''),
}).strict().refine(r=>r.period.length===(r.basis==='monthly'?7:4),'Monthly records need YYYY-MM; annual summaries need YYYY.')
 .refine(r=>!r.mapBlockCode||!!r.sourceBlockCode,'A map link requires an original block number.')
 .refine(r=>r.task.toUpperCase()!=='MILL','MILL is excluded from block wages.')
 .refine(r=>r.basis!=='annual_summary'||(!r.sourceBlockCode&&!r.mapBlockCode),'Annual division summaries cannot be assigned to individual blocks.');
export const wageId=(estateId,r)=>'wg-'+createHash('sha256').update(JSON.stringify([estateId,r.sourceSystem,r.sourceKey])).digest('hex').slice(0,40);
export function wageTotals(rows){
  const group=key=>{const totals=new Map();for(const r of rows)totals.set(r[key],(totals.get(r[key])||0)+r.amountMinor);return [...totals].map(([name,amountMinor])=>({name,amountMinor}));};
  const activities=new Map();for(const r of rows){const key=JSON.stringify([r.task,r.activity]);if(!activities.has(key))activities.set(key,{task:r.task,activity:r.activity,amountMinor:0});activities.get(key).amountMinor+=r.amountMinor;}
  return {byActivity:[...activities.values()].sort((a,b)=>b.amountMinor-a.amountMinor),amountMinor:rows.reduce((a,r)=>a+r.amountMinor,0),byTask:group('task').sort((a,b)=>b.amountMinor-a.amountMinor),
    byPeriod:group('period').sort((a,b)=>a.name.localeCompare(b.name)),byDivision:group('division').sort((a,b)=>b.amountMinor-a.amountMinor)};
}
export function installWages(api,models){
  const {Estate,Block,Wage,WageArea}=models;if(!Wage)return;
  const scope=async req=>{const estateId=id.parse(req.query.estateId||req.body?.estateId);
    if(!canAccess(req,estateId))throw new QueryError('Estate access denied',403);
    if(!await Estate.exists({_id:estateId}))throw new QueryError('Estate not found',404);return estateId;};
  const polygons=async estateId=>{const e=await Estate.findById(estateId).select('boundary').lean();return [...new Set((e.boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No).filter(Boolean))].sort();};
  const verify=async(estateId,rows)=>{const codes=new Set(await polygons(estateId));
    if(rows.some(r=>r.mapBlockCode&&!codes.has(r.mapBlockCode)))throw new QueryError('Choose an existing map block in this estate');
    const costs=rows.filter(r=>r.period);if(!costs.length)return;
    if(costs.some(r=>r.sourceBlockCode&&!r.mapBlockCode))throw new QueryError('Only costs linked to mapped blocks can be stored.');
    const years=[...new Set(costs.map(r=>Number(r.period.slice(0,4))))];
    const areas=await WageArea.find({estateId,year:{$in:years}}).select('year division mapHa mapBlockCode').lean();
    for(const r of costs){
      const group=areas.filter(a=>a.year===Number(r.period.slice(0,4))&&a.division===r.division&&codes.has(a.mapBlockCode));
      if(!r.sourceBlockCode&&(!group.length||group.some(a=>!(a.mapHa>0))||r.division==='DIVISION NOT SET'))
        throw new QueryError('This division has no complete map-area allocation. Add its mapped block areas first; costs outside mapped blocks are excluded.');
    }
  };
  api.get('/wages/areas',async(req,res)=>{
    const estateId=await scope(req),year=z.coerce.number().int().min(1900).max(2200).parse(req.query.year);
    const items=await WageArea.find({estateId,year}).select('-history').sort({division:1,sourceBlockCode:1}).limit(5001).lean();
    if(items.length>5000)throw new QueryError('Too many area records',413);
    res.json({items:items.map(r=>({...r,id:r._id}))});
  });
  const mapArea=async(estateId,code)=>{
    await verify(estateId,[{mapBlockCode:code}]);
    const block=await Block.findOne({estateId,blockCode:code}).lean();
    if(!block||!(block.gisAreaHa>0))throw new QueryError('This map block has no positive GIS hectares');
    return {mapHa:block.gisAreaHa,sourceBlockCode:code,sourceBlockId:block._id,sourcePeriod:block.surveyDate||'',sourceFile:block.sourceFile||'Map block table',sourceSheet:'GIS block inventory',sourceRow:block.sourceRow,sourceCell:'gisAreaHa'};
  };
  api.post('/wages/areas',requireWrite,async(req,res)=>{
    const estateId=await scope(req),body=z.object({year:z.number().int().min(1900).max(2200),mapBlockCode:label,division:label,note:z.string().max(4000)}).strict().parse(req.body.record);
    const source=await mapArea(estateId,body.mapBlockCode);
    const _id='wa-'+createHash('sha256').update(JSON.stringify([estateId,body.year,body.mapBlockCode])).digest('hex').slice(0,40);
    if(await WageArea.exists({_id}))throw new QueryError('This map block already has an allocation area for this year',409);
    await WageArea.create({_id,estateId,...body,...source,revision:0,updatedBy:req.access.subject});res.status(201).json({id:_id});
  });
  api.patch('/wages/areas/:id',requireWrite,async(req,res)=>{
    const estateId=await scope(req),body=z.object({division:label,note:z.string().max(4000)}).strict().parse(req.body.record);
    const where={_id:id.parse(req.params.id),estateId,revision:z.number().int().min(0).parse(req.body.revision)};
    const old=await WageArea.findOne(where).select('-history').lean();if(!old)throw new QueryError('Area changed. Reload before saving.',409);
    if(old.division!==body.division&&await Wage.exists({estateId,division:old.division,sourceBlockCode:null,period:{$gte:String(old.year),$lt:String(old.year+1)}})&&
      !await WageArea.exists({estateId,year:old.year,division:old.division,_id:{$ne:old._id}}))
      throw new QueryError('This is the last mapped block for a division with allocated costs. Keep a mapped block in that division.');
    const source=await mapArea(estateId,old.mapBlockCode);
    const changed=await WageArea.updateOne(where,{$set:{...body,...source,updatedBy:req.access.subject},$inc:{revision:1},$push:{history:{at:new Date(),by:req.access.subject,previous:old}}});
    if(!changed.modifiedCount)throw new QueryError('Area changed. Reload before saving.',409);res.json({saved:true});
  });
  api.get('/wages/allocation',async(req,res)=>{
    const estateId=await scope(req),q=z.object({year:z.string().regex(/^\d{4}$/),basis:z.enum(['monthly','annual_summary']).default('monthly'),
      mapBlockCode:z.string().max(200).optional(),task:z.string().max(200).optional(),activity:z.string().max(200).optional(),division:z.string().max(200).optional(),q:z.string().max(200).default(''),page:z.coerce.number().int().min(0).max(10000).default(0)}).parse(req.query);
    const [wages,areas]=await Promise.all([
      Wage.find({estateId,basis:q.basis,period:{$gte:q.year,$lt:String(Number(q.year)+1)},...(q.task?{task:q.task}:{}),...(q.activity?{activity:q.activity}:{}),...(q.division?{division:q.division}:{})}).select('-history').limit(50001).lean(),
      WageArea.find({estateId,year:Number(q.year)}).select('-history').limit(5001).lean(),
    ]);
    if(wages.length>50000||areas.length>5000)throw new QueryError('Too many allocation records',413);
    const {sources,...allocation}=allocateWages(wages,areas,q.mapBlockCode),items=allocation.items.filter(r=>!q.q||[r.mapBlockCode,r.task,r.activity,r.division].join(' ').toLowerCase().includes(q.q.toLowerCase())).sort((a,b)=>a.period.localeCompare(b.period)||a.sourceBlockCode.localeCompare(b.sourceBlockCode)||a.task.localeCompare(b.task)||a.activity.localeCompare(b.activity));
    const totals=wageTotals(items);
    res.json({...allocation,...totals,items:items.slice(q.page*25,(q.page+1)*25),count:items.length,
      selectedAreas:areas.filter(a=>a.mapBlockCode===q.mapBlockCode),unknownDivisionBlocks:areas.filter(a=>a.division==='DIVISION NOT SET').map(a=>a.mapBlockCode)});
  });
  api.get('/wages/meta',async(req,res)=>{
    const estateId=await scope(req),year=z.string().regex(/^\d{4}$/).default('2025').parse(req.query.year);
    const task=z.string().max(200).optional().parse(req.query.task);
    const [periods,divisions,tasks,mapBlocks,areaDivisions,activities]=await Promise.all([
      Wage.distinct('period',{estateId}),Wage.distinct('division',{estateId}),Wage.distinct('task',{estateId}),polygons(estateId),
      WageArea.distinct('division',{estateId,year:Number(year)}),
      Wage.distinct('activity',{estateId,period:{$gte:year,$lt:String(Number(year)+1)},...(task?{task}:{})}),
    ]);
    res.json({years:[...new Set(periods.map(p=>p.slice(0,4)))].sort().reverse(),divisions:[...new Set([...divisions,...areaDivisions])].sort(),tasks:tasks.filter(t=>t.toUpperCase()!=='MILL').sort(),activities:activities.sort(),mapBlocks});
  });
  api.get('/wages',async(req,res)=>{
    const estateId=await scope(req),q=z.object({basis:z.enum(['monthly','annual_summary']).default('monthly'),year:z.string().regex(/^\d{4}$/),
      division:z.string().max(200).optional(),task:z.string().max(200).optional(),activity:z.string().max(200).optional(),mapBlockCode:z.string().max(200).optional(),
      match:z.enum(['all','mapped','unmapped','group']).default('all'),q:z.string().max(200).default(''),
      page:z.coerce.number().int().min(0).max(10000).default(0),limit:z.coerce.number().int().min(1).max(500).default(25)}).parse(req.query);
    const where={estateId,basis:q.basis,period:{$gte:q.year,$lt:String(Number(q.year)+1)},
      ...(q.division?{division:q.division}:{}),...(q.task?{task:q.task}:{}),...(q.activity?{activity:q.activity}:{}),
      ...(q.mapBlockCode?{mapBlockCode:q.mapBlockCode}:q.match==='mapped'?{mapBlockCode:{$ne:null}}:
        q.match==='unmapped'?{mapBlockCode:null,sourceBlockCode:{$ne:null}}:q.match==='group'?{sourceBlockCode:null}:{})};
    let rows=await Wage.find(where).select('-history').sort({period:1,division:1,task:1,activity:1,_id:1}).limit(50001).maxTimeMS(10000).lean();
    if(rows.length>50000)throw new QueryError('Select a division or block to narrow the results',413);
    if(q.q)rows=rows.filter(r=>[r.task,r.activity,r.division,r.sourceBlockCode,r.mapBlockCode].join(' ').toLowerCase().includes(q.q.toLowerCase()));
    res.json({items:rows.slice(q.page*q.limit,(q.page+1)*q.limit).map(r=>({...r,id:r._id})),count:rows.length,...wageTotals(rows),
      counts:{mapped:rows.filter(r=>r.mapBlockCode).length,unmapped:rows.filter(r=>r.sourceBlockCode&&!r.mapBlockCode).length,group:rows.filter(r=>!r.sourceBlockCode).length}});
  });
  api.post('/wages',requireWrite,async(req,res)=>{
    const estateId=await scope(req),record=wageInput.parse(req.body.record);await verify(estateId,[record]);
    const _id=wageId(estateId,record);if(await Wage.exists({_id}))throw new QueryError('This source key already exists. Edit the existing wage record.',409);
    try{await Wage.create({_id,estateId,...record,revision:0,updatedBy:req.access.subject});}catch(e){if(e.code===11000)throw new QueryError('This source key already exists.',409);throw e;}
    res.status(201).json({id:_id});
  });
  api.patch('/wages/:id',requireWrite,async(req,res)=>{
    const estateId=await scope(req),record=wageInput.parse(req.body.record);await verify(estateId,[record]);
    const where={_id:id.parse(req.params.id),estateId,revision:z.number().int().min(0).parse(req.body.revision)};
    const old=await Wage.findOne(where).select('-history').lean();if(!old)throw new QueryError('Record changed. Reload before saving.',409);
    for(const k of ['sourceSystem','sourceKey','basis','period','division','task','activity','sourceBlockCode'])
      if(old[k]!==record[k])throw new QueryError('Original record identity cannot change. Create a separate record instead.');
    // Preserve imported provenance even when an editor submits only business fields.
    const changed=await Wage.updateOne(where,{$set:{...record,updatedBy:req.access.subject},$inc:{revision:1},$push:{history:{at:new Date(),by:req.access.subject,previous:old}}});
    if(!changed.modifiedCount)throw new QueryError('Record changed. Reload before saving.',409);res.json({saved:true});
  });
  api.get('/wages/:id/history',async(req,res)=>{const estateId=await scope(req),r=await Wage.findOne({_id:id.parse(req.params.id),estateId}).select('history').lean();
    if(!r)throw new QueryError('Wage record not found',404);res.json(r.history||[]);});
  api.post('/wages/import',requireWrite,async(req,res)=>{
    const estateId=await scope(req),records=z.array(wageInput).min(1).max(5000).parse(req.body.records);await verify(estateId,records);
    const keys=records.map(r=>wageId(estateId,r));if(new Set(keys).size!==keys.length)throw new QueryError('Duplicate source system/key in upload');
    const existing=await Wage.countDocuments({estateId,_id:{$in:keys}});
    if(req.body.preview!==false)return res.json({records:records.length,newRecords:records.length-existing,existingRecords:existing});
    const result=await Wage.bulkWrite(records.map((r,i)=>({updateOne:{filter:{_id:keys[i],estateId},update:{$setOnInsert:{estateId,...r,revision:0,updatedBy:req.access.subject}},upsert:true}})));
    res.json({inserted:result.upsertedCount,existing:records.length-result.upsertedCount});
  });
}
