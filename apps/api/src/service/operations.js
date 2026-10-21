import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError,SummaryCache} from './performance.js';
import {databasePage} from './table-pages.js';
import {materialSummaryBasis} from '../../../../packages/shared/material-issues.js';
export function installOperations(api,models){
 const {Estate,Block,StockIssue,LedgerEntry,CropReceipt}=models;if(!StockIssue)return;
 const metadataCache=new SummaryCache({ttl:20000,maxBytes:2*1024*1024,maxEntries:40});
 api.get('/operations/:kind',async(req,res)=>{
  const kind=z.enum(['materials','ledger','crop-receipts']).parse(req.params.kind);
  const q=z.object({estateId:z.string().regex(/^[\w-]{1,100}$/),year:z.string().regex(/^\d{4}$/),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),block:z.string().max(100).optional(),category:z.string().max(100).optional(),product:z.string().max(100).optional(),frequency:z.enum(['monthly','annual']).default('monthly'),q:z.string().max(150).default(''),cursor:z.string().max(5000).optional(),limit:z.coerce.number().int().min(1).max(100).default(50),page:z.coerce.number().int().min(0).max(100000).default(0),mode:z.enum(['table','analysis','metadata']).default('table')}).parse(req.query);
  if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);
  const estate=await Estate.findById(q.estateId).select('currency').lean();if(!estate)throw new QueryError('Estate not found',404);
  if(q.month&&!q.month.startsWith(q.year+'-'))throw new QueryError('Month must be within selected year');
  const Model=kind==='materials'?StockIssue:kind==='ledger'?LedgerEntry:CropReceipt;
  const where={estateId:q.estateId,month:q.month||{$gte:q.year+'-01',$lte:q.year+'-12'},...(q.block?{mapBlockCode:q.block}:{}),...(kind==='materials'?{approved:true,...(q.category?{categoryCode:q.category}:{}),...(q.product?{productId:q.product}:{})}:{})};
  if(q.q){const escaped=q.q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');where.$or=(kind==='materials'?['product','productCode','mapBlockCode']:['description','accountCode','documentNo','mapBlockCode','product']).map(k=>({[k]:{$regex:escaped,$options:'i'}}));}
  let result={items:[],count:0,nextCursor:null,limit:q.limit};
  if(kind==='materials'&&q.mode!=='metadata'){
   if(q.mode==='analysis'&&!q.product)throw new QueryError('Select one material for block analysis');
   const pipeline=[{$group:{_id:{month:q.frequency==='annual'?{$substrBytes:['$month',0,4]}:'$month',mapBlockCode:'$mapBlockCode',productId:'$productId',unit:'$unit'},productCode:{$first:'$productCode'},product:{$first:'$product'},category:{$first:'$category'},categoryCode:{$first:'$categoryCode'},netQuantity:{$sum:'$netQuantity'},lines:{$sum:1},issueSets:{$addToSet:'$issues'}}},{$set:{month:'$_id.month',mapBlockCode:'$_id.mapBlockCode',productId:'$_id.productId',unit:'$_id.unit',issues:{$reduce:{input:'$issueSets',initialValue:[],in:{$setUnion:['$$value',{$ifNull:['$$this',[]]}]}}}}},{$unset:'issueSets'}];
   result=await databasePage(Model,where,{cursor:q.cursor,limit:q.mode==='analysis'?5000:q.limit,order:{month:-1,mapBlockCode:1,productId:1,unit:1},pipeline,singlePass:true,offset:q.cursor||q.mode==='analysis'?0:q.page*q.limit});
   if(q.mode==='analysis'&&result.nextCursor)throw new QueryError('Select a block to narrow the material analysis',413);
   const blocks=await Block.find({estateId:q.estateId,blockCode:{$in:[...new Set(result.items.map(r=>r.mapBlockCode))]}}).select('blockCode totalPalms surveyDate metricSource referenceHa palmCountSource').maxTimeMS(5000).lean();
   result.items=materialSummaryBasis(result.items.map(r=>({...r,id:JSON.stringify(r._id)})),blocks);
  }else if(kind!=='materials')result=await databasePage(Model,where,{cursor:q.cursor,limit:q.limit,order:{month:-1,date:-1,_id:1},project:{raw:0},offset:q.cursor?0:q.page*q.limit});
  const metaKey=JSON.stringify([kind,q.estateId,q.year,q.category]);let meta=metadataCache.get(metaKey);
  if(!meta){const [months,blocks,products]=await Promise.all([Model.distinct('month',{estateId:q.estateId}),Model.distinct('mapBlockCode',{estateId:q.estateId}),kind==='materials'?Model.aggregate([{$match:{estateId:q.estateId,approved:true,month:{$gte:q.year+'-01',$lte:q.year+'-12'},...(q.category?{categoryCode:q.category}:{})}},{$group:{_id:'$productId',product:{$first:'$product'},unit:{$first:'$unit'}}},{$sort:{product:1}}]).option({maxTimeMS:5000}):[]]);meta={products,months:months.sort().reverse(),blocks:blocks.filter(Boolean).sort()};metadataCache.set(metaKey,meta);}
  res.set('Cache-Control','private, no-store').json({...result,...meta,currency:estate.currency,definition:kind==='materials'?'Approved net issues, grouped by issue month, block, product and source unit. Returns are deducted once from their original issue. Per-palm uses PDF survey counts dated 24 August 2025 as a fixed comparison basis. Only blocks lacking PDF palm counts use highlighted iPlant fallback details. Estimates, if any, are labelled. Zero/missing counts remain unavailable; no historical monthly census is implied. Stock issue is not confirmed application.':null});
 });
}
