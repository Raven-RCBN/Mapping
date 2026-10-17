import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError,SummaryCache} from './performance.js';
import {hash} from './trial-balance-data.js';
import {TB_COLLECTIONS} from './trial-balance-data.js';
const query=z.object({estateId:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),year:z.coerce.number().int().min(1900).max(2200).default(2025),accountCode:z.string().regex(/^\d{5}$/).optional(),filter:z.enum(['all','highlight','block_mismatch']).default('all'),q:z.string().trim().max(160).default(''),cursor:z.string().max(1500).optional()});
const row=({_id,...r})=>({...r,id:_id});
const literal=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function installTrialBalance(api,{Estate}){
 const db=()=>Estate.db.db;
 const totalsCache=new SummaryCache({ttl:20000,maxEntries:100,maxBytes:1024*1024});
 const scope=async req=>{const q=query.parse(req.query);if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);if(!await Estate.exists({_id:q.estateId}))throw new QueryError('Estate not found',404);return q};
 api.get('/trial-balance/meta',async(req,res)=>{
  const q=await scope(req),where={estateId:q.estateId,year:q.year,importState:'complete'};
  const accounts=await db().collection(TB_COLLECTIONS.summary).find(where,{projection:{contentHash:0,datasetHash:0,sourceHash:0}}).sort({sourceSequence:1}).limit(5001).maxTimeMS(5000).toArray();
  if(accounts.length>5000)throw new QueryError('Too many accounts',413);
  const years=await db().collection(TB_COLLECTIONS.summary).distinct('year',{estateId:q.estateId,importState:'complete'});
  res.json({accounts:accounts.map(row),years:years.sort((a,b)=>b-a),year:q.year,currency:'NGN',reportIntegrity:accounts[0]?.reportIntegrity||null,summary:{accounts:accounts.length,accountsWithDetails:accounts.filter(a=>a.detailsStatus==='reconciled').length,transactionCount:accounts.reduce((s,a)=>s+a.transactionCount,0),highlightCount:accounts.reduce((s,a)=>s+a.beigeDetailCount,0),blockMismatchCount:accounts.reduce((s,a)=>s+a.blockReviewDetailCount,0)}});
 });
 api.get('/trial-balance',async(req,res)=>{
  const q=await scope(req),where={estateId:q.estateId,year:q.year,importState:'complete',rowKind:'transaction'};
  if(q.accountCode)where.accountCode=q.accountCode;
  if(q.filter==='highlight')where.beigeFlag=true;
  if(q.filter==='block_mismatch')where.blockReviewRequired=true;
  if(q.q){const re={$regex:literal(q.q),$options:'i'};where.$or=['description','reference','accountCode','accountName','blockReference','blockMapping.references.sourceReference','blockMapping.references.blockCode','blockMapping.references.candidates.blockCode','reviewIssues.reason','beneficiary','employeeId','bank','location','item','components.description','components.blockReference'].map(k=>({[k]:re}));}
  const fingerprint=hash([req.access.subject,req.access.role,q.estateId,q.year,q.accountCode||null,q.filter,q.q]);
  const order={date:1,accountCode:1,sourceSequence:1,_id:1};
  let pageWhere=where;
  if(q.cursor){
   let cursor;try{cursor=JSON.parse(Buffer.from(q.cursor,'base64url').toString())}catch{throw new QueryError('Invalid page cursor. Start at the first page.')}
   const shape=z.object({fingerprint:z.literal(fingerprint),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),accountCode:z.string().regex(/^\d{5}$/),sourceSequence:z.number().int().positive(),_id:z.string().min(1).max(100)}).safeParse(cursor);
   if(!shape.success)throw new QueryError('This page cursor does not match the current filters. Start at the first page.');
   const keys=Object.keys(order),after=keys.map((key,i)=>Object.fromEntries([...keys.slice(0,i).map(k=>[k,cursor[k]]),[key,{$gt:cursor[key]}]]));
   pageWhere={$and:[where,{$or:after}]};
  }
  const col=db().collection(TB_COLLECTIONS.details);
  const countKey=fingerprint;
  const totalsPromise=async()=>{
   const cached=totalsCache.get(countKey);if(cached)return cached;
   const [total]=await col.aggregate([{$match:where},{$group:{_id:null,count:{$sum:1},debitMinor:{$sum:'$debitMinor'},creditMinor:{$sum:'$creditMinor'},netMinor:{$sum:'$netMinor'},highlightCount:{$sum:{$cond:['$beigeFlag',1,0]}},blockMismatchCount:{$sum:{$cond:['$blockReviewRequired',1,0]}}}}],{maxTimeMS:8000}).toArray();
   const result=total||{count:0,debitMinor:0,creditMinor:0,netMinor:0,highlightCount:0,blockMismatchCount:0};delete result._id;return totalsCache.set(countKey,result);
  };
  let found,totals;
  try{[found,totals]=await Promise.all([col.find(pageWhere,{projection:{contentHash:0,datasetHash:0,sourceHash:0,sourceExtraction:0}}).sort(order).limit(26).maxTimeMS(8000).toArray(),totalsPromise()]);}
  catch(e){if(e.code===50)throw new QueryError('This selection is too broad. Select an account or narrow the search and try again.',413);throw e;}
  const items=found.slice(0,25),last=items.at(-1),nextCursor=found.length>25?Buffer.from(JSON.stringify({fingerprint,...Object.fromEntries(Object.keys(order).map(k=>[k,last[k]]))})).toString('base64url'):null;
  res.json({items:items.map(row),count:totals.count,summary:totals,nextCursor,pageSize:25,year:q.year,currency:'NGN'});
 });
}
