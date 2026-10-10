import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canAccess, requireWrite } from './auth.js';
import { QueryError } from './performance.js';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
const number = z.number().finite().min(0).nullable();
export const monthlyInput = z.object({
  sourceBlockId: id, month, receiptStatus: z.enum(['received', 'not_received', 'unavailable']),
  mt: number, bunches: number, workbookPalms: number.optional(), gpsHa: number.optional(),
  effectiveHa: number.optional(), yieldAreaHa: number.optional(), sourceAbw: number.optional(),
  sourceYield: number.optional(), sourceBunchesHa:number.optional(), sourceBunchesPalm:number.optional(), harvestingDays: number.optional(),
  plantingYear: z.string().max(60).optional(), parameterNote: z.string().max(2000).optional(),
  note: z.string().max(4000).optional(), sourceFile: z.string().max(300).optional(),
  sourceSheet: z.string().max(100).optional(), sourceRow: z.number().int().positive().optional(),
  sourceSystem: z.string().max(100).default('manual'), sourceKey: z.string().max(300).optional(),
  sourceHash: z.string().max(64).optional(), sourceCells: z.record(z.string(), z.string().max(100)).optional(),
  issues: z.array(z.string().max(500)).max(30).default([]),
}).strict().refine(r => r.receiptStatus !== 'not_received' || [r.mt,r.bunches].every(v=>v===0 || v===null),
  'Not received records must have zero or unavailable production.');
export const nameInput = z.object({
  sourceBlockCode: z.string().trim().min(1).max(100), division: z.string().max(100),
  mapBlockCode: z.string().max(100).nullable(),
  linkMethod: z.enum(['code', 'confirmed_alias', 'shared_polygon', 'unmapped']),
  firstMonth: month, lastMonth: month, note: z.string().max(2000).default(''),
}).strict().refine(r=>r.firstMonth<=r.lastMonth,'Last observed month must follow first month.')
  .refine(r=>Boolean(r.mapBlockCode) === (r.linkMethod!=='unmapped'),'Choose a map block or mark the name unmapped.');
export const monthlyId = (estateId, sourceBlockId, period) => 'mp-'+createHash('sha256').update(JSON.stringify([estateId,sourceBlockId,period])).digest('hex').slice(0,40);
export function productionView(r, name, block) {
  const shared = name?.linkMethod === 'shared_polygon';
  const comparable = !shared && r.workbookPalms != null && block?.totalPalms != null;
  const received = r.receiptStatus === 'received';
  return {...r, id:r._id, sourceBlockCode:name?.sourceBlockCode, division:name?.division,
    mapBlockCode:name?.mapBlockCode ?? null, linkMethod:name?.linkMethod ?? 'unmapped',
    gisPalms:block?.totalPalms ?? null, gisSurveyDate:block?.surveyDate ?? null,
    gisAreaHa:block?.gisAreaHa ?? null,
    palmDifference:comparable ? r.workbookPalms-block.totalPalms : null,
    palmStatus:shared ? 'Shared polygon — counts not comparable' : !comparable ? 'Count unavailable' :
      r.workbookPalms===block.totalPalms ? 'Agrees' : 'Palm count differs',
    abw:received && r.bunches>0 && r.mt!=null ? r.mt*1000/r.bunches : null,
    yieldPerHa:received && r.yieldAreaHa>0 && r.mt!=null ? r.mt/r.yieldAreaHa : null,
    bunchesPerHa:received && r.yieldAreaHa>0 && r.bunches!=null ? r.bunches/r.yieldAreaHa : null,
    bunchesPerPalm:received && r.workbookPalms>0 && r.bunches!=null ? r.bunches/r.workbookPalms : null,
  };
}

export function installProduction(api, models) {
  const {Estate, Block, ProductionName, MonthlyProduction, YearlyProduction} = models;
  if (!ProductionName || !MonthlyProduction) return;
  const scope = async (req) => {
    const estateId=id.parse(req.query.estateId || req.body?.estateId);
    if (!canAccess(req,estateId)) throw new QueryError('Estate access denied',403);
    if (!await Estate.exists({_id:estateId})) throw new QueryError('Estate not found',404);
    return estateId;
  };
  const namesAndBlocks = async estateId => {
    const [names,blocks]=await Promise.all([ProductionName.find({estateId}).select('-history').limit(5001).lean(),Block.find({estateId}).limit(5001).lean()]);
    if(names.length>5000||blocks.length>5000) throw new QueryError('Estate exceeds the supported block limit',413);
    return {names,blocks};
  };
  const verifyName = async (estateId, record) => {
    if (!await ProductionName.exists({_id:record.sourceBlockId,estateId})) throw new QueryError('Choose a source block in this estate');
  };
  const verifyMap = async (estateId, record) => {
    if (!record.mapBlockCode) return;
    const e=await Estate.findById(estateId).select('boundary').lean();
    const codes=new Set((e.boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No));
    if (!codes.has(record.mapBlockCode)) throw new QueryError('Choose an existing mapped polygon in this estate');
  };
  api.get('/production/meta',async(req,res)=>{
    const estateId=await scope(req);
    const [months,latest,inventory]=await Promise.all([
      MonthlyProduction.distinct('month',{estateId}),
      MonthlyProduction.findOne({estateId,receiptStatus:'received'}).sort({month:-1}).select('month').lean(),
      namesAndBlocks(estateId),
    ]);
    res.json({months:months.sort().reverse(),latestReceived:latest?.month||null,
      names:inventory.names.map(n=>({...n,id:n._id})),mapBlocks:inventory.blocks.filter(b=>b.mapBlockNames?.length).map(b=>b.blockCode).sort()});
  });
  api.get('/production/monthly',async(req,res)=>{
    const estateId=await scope(req), q=z.object({month:month.optional(),year:z.string().regex(/^\d{4}$/).optional(),
      sourceBlockId:id.optional(),mapBlockCode:z.string().max(100).optional(),q:z.string().max(100).default(''),
      match:z.enum(['all','mapped','unmapped','differences']).default('all'),
      page:z.coerce.number().int().min(0).max(10000).default(0),limit:z.coerce.number().int().min(1).max(5000).default(50)}).parse(req.query);
    if(!q.month&&!q.year&&!q.sourceBlockId&&!q.mapBlockCode) throw new QueryError('Select a month, year or source block');
    const {names,blocks}=await namesAndBlocks(estateId), bm=new Map(blocks.map(b=>[b.blockCode,b])),nm=new Map(names.map(n=>[n._id,n]));
    const chosen=names.filter(n=>(!q.sourceBlockId||n._id===q.sourceBlockId)&&(!q.mapBlockCode||n.mapBlockCode===q.mapBlockCode)&&
      (q.match!=='mapped'||n.mapBlockCode)&&(q.match!=='unmapped'||!n.mapBlockCode)&&
      (!q.q||[n.sourceBlockCode,n.mapBlockCode,n.division].some(v=>v?.toLowerCase().includes(q.q.toLowerCase()))));
    const where={estateId,sourceBlockId:{$in:chosen.map(n=>n._id)},...(q.month?{month:q.month}:q.year?{month:{$gte:q.year+'-01',$lte:q.year+'-12'}}:{})};
    const raw=await MonthlyProduction.find(where).select('-history').sort({month:-1,sourceBlockId:1}).limit(60001).maxTimeMS(10000).lean();
    if(raw.length>60000) throw new QueryError('Select a shorter reporting period',413);
    let rows=raw.map(r=>{const n=nm.get(r.sourceBlockId);return productionView(r,n,bm.get(n?.mapBlockCode));});
    if(q.match==='differences') rows=rows.filter(r=>r.palmDifference!=null&&r.palmDifference!==0);
    rows.sort((a,b)=>b.month.localeCompare(a.month)||a.sourceBlockCode.localeCompare(b.sourceBlockCode,undefined,{numeric:true})||a.division.localeCompare(b.division));
    res.json({items:rows.slice(q.page*q.limit,(q.page+1)*q.limit),count:rows.length,
      counts:{mapped:rows.filter(r=>r.mapBlockCode).length,unmapped:rows.filter(r=>!r.mapBlockCode).length,
        notReceived:rows.filter(r=>r.receiptStatus==='not_received').length,palmDifferences:rows.filter(r=>r.palmDifference!=null&&r.palmDifference!==0).length}});
  });
  api.post('/production/names',requireWrite,async(req,res)=>{
    const estateId=await scope(req),body=nameInput.parse(req.body.record);await verifyMap(estateId,body);
    const doc=await ProductionName.create({_id:'pn-'+randomUUID(),estateId,...body,revision:0,updatedBy:req.access.subject});res.status(201).json({id:doc._id});
  });
  api.get('/production/yearly',async(req,res)=>{
    const estateId=await scope(req),{names,blocks}=await namesAndBlocks(estateId);
    const nm=new Map(names.map(n=>[n._id,n])),bm=new Map(blocks.map(b=>[b.blockCode,b]));
    const code=z.string().max(100).optional().parse(req.query.mapBlockCode);
    const source=id.optional().parse(req.query.sourceBlockId);
    const raw=await YearlyProduction.find({estateId,...(code?{sourceBlockId:{$in:names.filter(n=>n.mapBlockCode===code).map(n=>n._id)}}:source?{sourceBlockId:source}:{})}).select('-history').sort({year:-1,sourceBlockId:1}).limit(5001).lean();
    if(raw.length>5000) throw new QueryError('Select a block to view annual records',413);
    res.json({items:raw.map(r=>{const n=nm.get(r.sourceBlockId);return productionView(r,n,bm.get(n?.mapBlockCode));})});
  });
  const saveYearly=async(req,res)=>{
    const estateId=await scope(req),{year,periodLabel,...rest}=req.body.record||{};
    const record={...monthlyInput.parse(rest),year:z.number().int().min(1900).max(2200).parse(year),periodLabel:z.string().min(1).max(100).parse(periodLabel)};
    if(Number(record.month.slice(0,4))!==record.year) throw new QueryError('Reporting month and year must agree');
    await verifyName(estateId,record);
    if(req.params.id){
      const where={_id:id.parse(req.params.id),estateId,revision:z.number().int().min(0).parse(req.body.revision)};
      const old=await YearlyProduction.findOne(where).select('-history').lean();
      if(!old) throw new QueryError('This annual record changed. Reload before saving.',409);
      if(old.sourceBlockId!==record.sourceBlockId||old.year!==record.year) throw new QueryError('Source block and year cannot change');
      const result=await YearlyProduction.updateOne(where,{$set:{...record,updatedBy:req.access.subject},$inc:{revision:1},$push:{history:{at:new Date(),by:req.access.subject,previous:old}}});
      if(!result.modifiedCount) throw new QueryError('This annual record changed. Reload before saving.',409);
      return res.json({saved:true});
    }
    if(await YearlyProduction.exists({estateId,sourceBlockId:record.sourceBlockId,year:record.year})) throw new QueryError('This source block already has an annual record for that year',409);
    const _id='yp-'+randomUUID();await YearlyProduction.create({_id,estateId,...record,revision:0,updatedBy:req.access.subject});res.status(201).json({id:_id});
  };
  api.post('/production/yearly',requireWrite,saveYearly);
  api.patch('/production/yearly/:id',requireWrite,saveYearly);
  api.patch('/production/names/:id',requireWrite,async(req,res)=>{
    const estateId=await scope(req),body=nameInput.parse(req.body.record);await verifyMap(estateId,body);
    const revision=z.number().int().min(0).parse(req.body.revision),where={_id:id.parse(req.params.id),estateId,revision};
    const old=await ProductionName.findOne(where).select('-history').lean();
    if(!old) throw new QueryError('This mapping changed. Reload before saving.',409);
    if(old.sourceBlockCode!==body.sourceBlockCode||old.division!==body.division)
      throw new QueryError('Historical source names and planting groups cannot be renamed. Add a new source name and link it to the current map block.');
    const changed=await ProductionName.updateOne(where,{$set:{...body,updatedBy:req.access.subject},$inc:{revision:1},$push:{history:{at:new Date(),by:req.access.subject,previous:old}}});
    if(!changed.modifiedCount) throw new QueryError('This mapping changed. Reload before saving.',409);
    res.json({saved:true});
  });
  api.post('/production/monthly',requireWrite,async(req,res)=>{
    const estateId=await scope(req),record=monthlyInput.parse(req.body.record);await verifyName(estateId,record);
    const _id=monthlyId(estateId,record.sourceBlockId,record.month);
    if(await MonthlyProduction.exists({_id})) throw new QueryError('This source block already has a record for this month. Edit the existing record.',409);
    await MonthlyProduction.create({_id,estateId,...record,revision:0,updatedBy:req.access.subject});res.status(201).json({id:_id});
  });
  api.patch('/production/monthly/:id',requireWrite,async(req,res)=>{
    const estateId=await scope(req),record=monthlyInput.parse(req.body.record);await verifyName(estateId,record);
    const revision=z.number().int().min(0).parse(req.body.revision),where={_id:id.parse(req.params.id),estateId,revision};
    const old=await MonthlyProduction.findOne(where).select('-history').lean();
    if(!old) throw new QueryError('This record changed. Reload before saving.',409);
    if(old.sourceBlockId!==record.sourceBlockId||old.month!==record.month) throw new QueryError('The source block and month cannot change. Add a separate monthly record.');
    const changed=await MonthlyProduction.updateOne(where,{$set:{...record,updatedBy:req.access.subject},$inc:{revision:1},$push:{history:{at:new Date(),by:req.access.subject,previous:old}}});
    if(!changed.modifiedCount) throw new QueryError('This record changed. Reload before saving.',409);
    res.json({saved:true});
  });
  api.get('/production/monthly/:id/history',async(req,res)=>{
    const estateId=await scope(req),doc=await MonthlyProduction.findOne({_id:id.parse(req.params.id),estateId}).select('history').lean();
    if(!doc) throw new QueryError('Record not found',404);res.json(doc.history||[]);
  });
  api.post('/production/import',requireWrite,async(req,res)=>{
    const estateId=await scope(req),rows=z.array(monthlyInput).min(1).max(5000).parse(req.body.records);
    const names=await ProductionName.find({estateId}).select('_id').lean(),known=new Set(names.map(n=>n._id));
    const keys=rows.map(r=>monthlyId(estateId,r.sourceBlockId,r.month));
    if(new Set(keys).size!==keys.length) throw new QueryError('Duplicate source block/month in this file');
    if(rows.some(r=>!known.has(r.sourceBlockId))) throw new QueryError('One or more source blocks do not belong to this estate');
    const existing=await MonthlyProduction.countDocuments({_id:{$in:keys},estateId});
    if(req.body.preview!==false) return res.json({records:rows.length,newRecords:rows.length-existing,existingRecords:existing});
    // Insert-only import protects manual corrections and is safe to repeat.
    const result=await MonthlyProduction.bulkWrite(rows.map((record,i)=>({updateOne:{filter:{_id:keys[i],estateId},update:{$setOnInsert:{estateId,...record,revision:0,updatedBy:req.access.subject}},upsert:true}})));
    res.json({inserted:result.upsertedCount,existing:rows.length-result.upsertedCount});
  });
}
