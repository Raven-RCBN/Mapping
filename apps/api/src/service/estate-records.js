import {refreshTrialReport} from './record-totals.js';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {workbookSheets} from './estate-workbook-schema.js';
import {parseValue} from './estate-workbook.js';
import {nameInput} from './production.js';
import {canAccess,requireWrite} from './auth.js';
import {permitted} from '../../../../packages/shared/access.js';
import {QueryError,invalidateSummaries} from './performance.js';
const c=(key,label,type='text')=>({key,label,type});
export const recordSheets=[{name:'Wage allocation areas',model:'WageArea',menu:'wages',keys:['year','mapBlockCode'],columns:[c('year','Year','year'),c('mapBlockCode','Map block'),c('division','Division'),c('mapHa','Map hectares','number'),c('note','Note')]},...workbookSheets.filter(s=>!s.parameters).map(s=>s.model==='MonthlyProduction'?{...s,columns:[...s.columns,...workbookSheets.find(p=>p.parameters).columns.filter(c=>!s.columns.some(x=>x.key===c.key))]}:s),
 {name:'Vehicle expenses',model:'VehicleTransaction',menu:'vehicles',keys:['vehicleId','importId','sourceSystem','sourceKey','year'],columns:[c('date','Date','date'),c('transactionNo','Transaction number'),c('description','Description'),c('category','Category'),c('subcategory','Subcategory'),c('itemName','Item'),c('quantity','Quantity','number'),c('quantityUnit','Unit'),c('amountMinor','Amount (minor units)','minor')]},
 {name:'Trial-balance transactions',model:'TrialBalanceDetail',menu:'trial-balance',keys:['year','accountKey','sourceSequence'],columns:[c('year','Year','year'),c('accountCode','Account code'),c('accountName','Account name'),c('date','Date','date'),c('reference','Reference'),c('description','Description'),c('debitMinor','Debit (minor units)','minorPositive'),c('creditMinor','Credit (minor units)','minorPositive'),c('note','Note')]},
];
const fail=(message,status=400)=>{throw new QueryError(message,status);};
const allow=(a,id,menu,action='view')=>a.managed?permitted(a,id,menu,action):action==='view'||['admin','manager'].includes(a.role);
const stamp=r=>createHash('sha256').update(JSON.stringify(r)).digest('hex');
const immutable=(def,c)=>def.keys.includes(c.key)||c.key==='sourceKey'||(def.source&&['sourceBlockCode','division'].includes(c.key))||(def.model==='VehicleUsage'&&c.key==='sourceIdentifier')||(def.model==='TrialBalanceSummary'&&c.key==='accountCode')||(def.model==='TrialBalanceDetail'&&['accountCode','accountName'].includes(c.key));
export function installEstateRecords(api,models,config){
 const locks=new Set();
 const scope=async req=>{
  const estateId=String(req.query.estateId||req.body?.estateId||''),def=recordSheets.find(s=>s.model===req.params.model);
  if(!def)fail('Unknown table',404);
  if(!canAccess(req,estateId)||!allow(req.access,estateId,def.menu))fail('Estate/table access denied',403);
  if(!await models.Estate.exists({_id:estateId}))fail('Estate not found',404);
  return {estateId,def,Model:models[def.model]};
 };
 const read=async(req,ctx)=>{const r=await ctx.Model.findOne({_id:req.params.id,estateId:ctx.estateId}).select('-history').lean();if(!r)fail('Record not found',404);return r;};
 async function publicRow(def,r){
  const data={};for(const c of def.columns)data[c.key]=r[c.key]??'';
  if(def.source){const n=await models.ProductionName.findOne({_id:r.sourceBlockId,estateId:r.estateId}).lean();data.sourceBlockCode=n?.sourceBlockCode||'';data.division=n?.division||'';}
  if(def.model==='VehicleUsage'){const v=await models.Vehicle.findOne({_id:r.vehicleId,estateId:r.estateId}).lean();data.sourceIdentifier=v?.sourceIdentifier||v?.name||'';}
  if(def.generic)for(let i=0;i<6;i++)data['cell'+i]=r.cells?.[i]||'';
  return {id:r._id,data,stamp:stamp(r)};
 }
 api.get('/estate-records/:model',async(req,res)=>{
  const {estateId,def,Model}=await scope(req),page=Number(req.query.page||0);
  if(!Number.isInteger(page)||page<0||page>2000)fail('Invalid page');
  const filter={estateId,...(def.model==='TrialBalanceDetail'?{rowKind:'transaction'}:{})};
  for(const k of ['mapBlockCode','blockCode','month','sourceBlockId','vehicleId','productId','accountKey','importId','year','period','division','unit'])if(req.query[k]){if(!Model.schema.path(k))continue;filter[k]=k==='year'?Number(req.query[k]):String(req.query[k]).slice(0,200);}
  if(req.query.q){const q=String(req.query.q).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const fields=['blockCode','mapBlockCode','sourceKey','sourceBlockCode','description','name','accountName','employeeName'].filter(k=>Model.schema.path(k));if(fields.length)filter.$or=fields.map(k=>({[k]:{$regex:q,$options:'i'}}));}
  const rows=await Model.find(filter).select('-history').sort({_id:1}).skip(page*25).limit(26).maxTimeMS(10000).lean();
  res.json({name:def.name,columns:def.columns.map(c=>({...c,readonly:immutable(def,c)})),items:await Promise.all(rows.slice(0,25).map(r=>publicRow(def,r))),more:rows.length>25,canEdit:allow(req.access,estateId,def.menu,'edit'),canDelete:allow(req.access,estateId,def.menu,'delete')});
 });
 api.get('/estate-records/:model/:id',async(req,res)=>{const ctx=await scope(req),r=await read(req,ctx);res.json({...await publicRow(ctx.def,r),name:ctx.def.name,columns:ctx.def.columns.map(c=>({...c,readonly:immutable(ctx.def,c)}))});});
 async function dependencies(def,old){
  const e={estateId:old.estateId};let found=false;
  if(def.model==='Block')found=await models.HarvestingActivity.exists({...e,blockId:old._id})||await models.FieldActivity.exists({...e,blockId:old._id});
  if(def.model==='ProductionName')found=await models.MonthlyProduction.exists({...e,sourceBlockId:old._id})||await models.YearlyProduction.exists({...e,sourceBlockId:old._id})||await models.ProductionComment.exists({...e,sourceBlockId:old._id});
  if(def.model==='Vehicle')found=await models.VehicleUsage.exists({...e,vehicleId:old._id})||await models.VehicleTransaction.exists({...e,vehicleId:old._id});
  if(def.model==='TrialBalanceSummary')found=await models.TrialBalanceDetail.exists({...e,year:old.year,accountKey:old.accountKey});
  if(found)fail('This record has linked transactions. Delete or reassign those transactions first.',409);
 }
 async function validate(def,old,values){
  if(!values||typeof values!=='object'||Array.isArray(values))fail('Provide record fields');
  const update={};
  for(const [key,value]of Object.entries(values)){
   const col=def.columns.find(c=>c.key===key);if(!col||immutable(def,col))fail(`Field ${key} cannot be changed here`);
   const v=parseValue(value,col);if(v!==undefined)update[key]=v;
  }
  const r={...old,...update},estate=await models.Estate.findById(old.estateId).lean();
  const codes=new Set((estate.boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No));
  if(update.mapBlockCode&&!codes.has(update.mapBlockCode))fail('Choose a current map block in this estate');
  if(update.blockCode&&!await models.Block.exists({estateId:old.estateId,blockCode:update.blockCode}))fail('Block does not exist in this estate');
  if(update.currency&&update.currency!==estate.currency)fail('Currency must match estate setup');
  if(def.model==='ProductionName')nameInput.parse(Object.fromEntries(['sourceBlockCode','division','mapBlockCode','linkMethod','firstMonth','lastMonth','note'].map(k=>[k,r[k]])));
  if(['MonthlyProduction','YearlyProduction'].includes(def.model)&&r.receiptStatus==='not_received'&&[r.mt,r.looseFruitMt,r.bunches].some(n=>n!=null&&n!==0))fail('Not received records cannot have positive production');
  if(def.model==='YearlyProduction'&&update.month&&!update.month.startsWith(String(old.year)+'-'))fail('Month must be in the stated year');
  if(def.model==='Wage'&&r.task?.toUpperCase()==='MILL')fail('MILL is excluded from block wages');
  if(def.model==='StockIssue'&&['unit','netQuantity','productCode'].some(k=>update[k]!==undefined&&update[k]!==old[k]))Object.assign(update,{productId:r.productCode,normalizationStatus:'unresolved',normalizedQuantity:null,normalizedUnit:null,conversionFactor:null,conversionBasis:null});
  if(update.date)update.month=update.date.slice(0,7);
  if(def.model==='VehicleTransaction'&&update.date&&!update.date.startsWith(old.year+'-'))fail('Expense date must stay within the imported year');
  if(def.model==='TrialBalanceDetail'&&update.date&&!update.date.startsWith(old.year+'-'))fail('Transaction date must stay within the account year');
  if(['TrialBalanceSummary','TrialBalanceDetail'].includes(def.model)){update.netMinor=(r.debitMinor||0)-(r.creditMinor||0);if(def.model==='TrialBalanceSummary'&&old.detailNetMinor!=null)update.reconciliationDifferenceMinor=update.netMinor-old.detailNetMinor;}
  if(def.generic){update.cells=Array.from({length:Math.max(6,old.cells?.length||0)},(_,i)=>update['cell'+i]??old.cells?.[i]??'');for(let i=0;i<6;i++)delete update['cell'+i];}
  if(def.model==='Vehicle')update.sourceLabel=r.name;
  if(def.model==='TrialBalanceDetail'&&Object.keys(update).length){update.reviewIssues=[...(old.reviewIssues||[]).filter(i=>i.type!=='manual_edit'),{type:'manual_edit',category:'manual',reason:'Transaction manually revised; review original source breakdown.'}];update.beigeFlag=true;update.highlightColor='#F2E4CC';if(old.componentTotalMinor!=null)update.componentVarianceMinor=update.netMinor-old.componentTotalMinor;}
  if(def.event&&update.blockCode){const b=await models.Block.findOne({estateId:old.estateId,blockCode:update.blockCode}).lean();update.blockId=b._id;}
  await new models[def.model]({...old,...update}).validate();return update;
 }
 async function reconcile(def,old){
  const estateId=old.estateId;
  if(def.model==='VehicleTransaction'){
   const rows=await models.VehicleTransaction.aggregate([{$match:{estateId,importId:old.importId}},{$group:{_id:'$vehicleId',amountMinor:{$sum:'$amountMinor'},transactionCount:{$sum:1}}}]);
   const imp=await models.VehicleImport.findOne({_id:old.importId,estateId}).lean();
   if(imp)await models.VehicleImport.updateOne({_id:imp._id,estateId},{$set:{amountMinor:rows.reduce((n,r)=>n+r.amountMinor,0),transactionCount:rows.reduce((n,r)=>n+r.transactionCount,0),vehicleCount:rows.length,headers:(imp.headers||[]).map(h=>({...h,amountMinor:rows.find(r=>r._id===h.vehicleId)?.amountMinor||0,transactionCount:rows.find(r=>r._id===h.vehicleId)?.transactionCount||0}))}});
  }
  if(def.model==='TrialBalanceDetail'){
   const where={estateId,year:old.year,accountKey:old.accountKey};
   const rows=await models.TrialBalanceDetail.aggregate([{$match:{...where,rowKind:'transaction',importState:'complete'}},{$group:{_id:null,n:{$sum:1},net:{$sum:'$netMinor'},highlights:{$sum:{$cond:['$beigeFlag',1,0]}},blockReviews:{$sum:{$cond:['$blockReviewRequired',1,0]}}}}]);
   const summary=await models.TrialBalanceSummary.findOne(where).lean();
   if(summary)await models.TrialBalanceSummary.updateOne({_id:summary._id},{$set:{beigeDetailCount:rows[0]?.highlights||0,blockReviewDetailCount:rows[0]?.blockReviews||0,detailsStatus:summary.netMinor===(rows[0]?.net||0)?'reconciled':'difference',transactionCount:rows[0]?.n||0,detailRowCount:await models.TrialBalanceDetail.countDocuments(where),detailNetMinor:rows[0]?.net||0,reconciliationDifferenceMinor:(summary.netMinor||0)-(rows[0]?.net||0)}});
  }
  if(['TrialBalanceSummary','TrialBalanceDetail'].includes(def.model))await refreshTrialReport(models,estateId,old.year);
  if(def.model==='DocumentRow')await models.DocumentImport.updateOne({_id:old.importId,estateId},{$set:{rowCount:await models.DocumentRow.countDocuments({importId:old.importId,estateId})}});
 }
 async function mutate(req,res,deleting){
  const ctx=await scope(req),{def,Model,estateId}=ctx;
  if(!allow(req.access,estateId,def.menu,deleting?'delete':'edit'))fail('Permission denied',403);
  if(locks.has(estateId))fail('Another record is being saved. Try again shortly.',409);locks.add(estateId);
  try{
   const old=await read(req,ctx);if(stamp(old)!==req.body.stamp)fail('This record changed. Reopen it before saving.',409);
   if(old.verifiedAt||old.status==='verified')fail('Review and unverify this activity before changing it.',409);
   if(deleting)await dependencies(def,old);
   const update=deleting?null:await validate(def,old,req.body.values);
   const dir=path.join(config.dataDir,'estates',estateId,'record-history');await fs.mkdir(dir,{recursive:true,mode:0o700});
   const journal=path.join(dir,randomUUID()+'.json'),audit={at:new Date(),by:req.access.subject,model:def.model,action:deleting?'delete':'edit',previous:old,changes:update};
   await fs.writeFile(journal,JSON.stringify({...audit,status:'pending'}),{flag:'wx',mode:0o600});
   const where={_id:old._id,estateId,...(old.updatedAt?{updatedAt:old.updatedAt}:{}),...(old.revision!=null?{revision:old.revision}:{})};
   let result;
   if(deleting)result=await Model.deleteOne(where);
   else{const change={$set:update};if(Model.schema.path('updatedBy'))change.$set.updatedBy=req.access.subject;if(Model.schema.path('revision'))change.$inc={revision:1};if(Model.schema.path('history'))change.$push={history:{at:new Date(),by:req.access.subject,previous:old}};result=await Model.updateOne(where,change,{runValidators:true});}
   if((deleting?result.deletedCount:result.matchedCount)!==1)fail('Record changed while saving. Reopen it.',409);
   invalidateSummaries();
   await reconcile(def,old);
   invalidateSummaries();
   await fs.writeFile(journal,JSON.stringify({...audit,status:'complete'}),{mode:0o600});
   res.json({saved:true,deleted:deleting});
  }finally{locks.delete(estateId);}
 }
 api.patch('/estate-records/:model/:id',requireWrite,(req,res)=>mutate(req,res,false));
 api.delete('/estate-records/:model/:id',requireWrite,(req,res)=>mutate(req,res,true));
}
