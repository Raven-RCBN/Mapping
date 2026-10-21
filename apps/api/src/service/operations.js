import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
import {materialPerPalm} from '../../../../packages/shared/material-issues.js';
export function installOperations(api,models){
 const {Estate,Block,StockIssue,LedgerEntry,CropReceipt}=models;if(!StockIssue)return;
 api.get('/operations/:kind',async(req,res)=>{
  const kind=z.enum(['materials','ledger','crop-receipts']).parse(req.params.kind);
  const q=z.object({estateId:z.string().regex(/^[\w-]{1,100}$/),year:z.string().regex(/^\d{4}$/),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),block:z.string().max(100).optional(),category:z.string().max(100).optional(),product:z.string().max(100).optional(),frequency:z.enum(['monthly','annual']).default('monthly'),q:z.string().max(150).default(''),page:z.coerce.number().int().min(0).max(100000).default(0)}).parse(req.query);
  if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);
  const estate=await Estate.findById(q.estateId).select('currency').lean();if(!estate)throw new QueryError('Estate not found',404);
  if(q.month&&!q.month.startsWith(q.year+'-'))throw new QueryError('Month must be within selected year');
  const Model=kind==='materials'?StockIssue:kind==='ledger'?LedgerEntry:CropReceipt;
  const where={estateId:q.estateId,month:q.month||{$gte:q.year+'-01',$lte:q.year+'-12'},...(q.block?{mapBlockCode:q.block}:{}),...(kind==='materials'?{approved:true,...(q.category?{categoryCode:q.category}:{}),...(q.product?{productId:q.product}:{})}:{})};
  if(q.q){const escaped=q.q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');where.$or=(kind==='materials'?['product','productCode','mapBlockCode']:['description','accountCode','documentNo','mapBlockCode','product']).map(k=>({[k]:{$regex:escaped,$options:'i'}}));}
  let items,count;
  if(kind==='materials'){
   const [raw,blocks]=await Promise.all([Model.find(where).select('-raw').limit(50001).maxTimeMS(10000).lean(),Block.find({estateId:q.estateId}).select('blockCode totalPalms surveyDate sourceSql metricSource referenceHa palmCountSource').limit(5001).lean()]);
   if(raw.length>50000||blocks.length>5000)throw new QueryError('Select a block or month to narrow the report',413);
   const summary=materialPerPalm(q.frequency==='annual'?raw.map(r=>({...r,month:r.month.slice(0,4)})):raw,blocks);count=summary.length;items=summary.slice(q.page*50,q.page*50+50);
  }else{[count,items]=await Promise.all([Model.countDocuments(where).maxTimeMS(10000),Model.find(where).select('-raw').sort({month:-1,date:-1,_id:1}).skip(q.page*50).limit(50).maxTimeMS(10000).lean()]);}
  const [months,blocks,products]=await Promise.all([Model.distinct('month',{estateId:q.estateId}),Model.distinct('mapBlockCode',{estateId:q.estateId}),kind==='materials'?Model.aggregate([{$match:{estateId:q.estateId,approved:true,...(q.category?{categoryCode:q.category}:{})}},{$group:{_id:'$productId',product:{$first:'$product'},unit:{$first:'$unit'}}},{$sort:{product:1}}]).option({maxTimeMS:5000}):[]]);
  res.set('Cache-Control','private, no-store').json({items:items.map(r=>({...r,id:r.id||r._id})),count,page:q.page,limit:50,currency:estate.currency,products,months:months.sort().reverse(),blocks:blocks.filter(Boolean).sort(),definition:kind==='materials'?'Approved net issues, grouped by issue month, block, product and source unit. Returns are deducted once from their original issue. Per-palm uses PDF survey counts dated 24 August 2025 as a fixed comparison basis. Only blocks lacking PDF palm counts use highlighted iPlant fallback details. Estimates, if any, are labelled. Zero/missing counts remain unavailable; no historical monthly census is implied. Stock issue is not confirmed application.':null});
 });
}
