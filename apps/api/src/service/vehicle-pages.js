import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
import {databasePage,searchLiteral} from './table-pages.js';
export function installVehiclePages(api,{Estate,Vehicle,VehicleImport,VehicleTransaction,VehicleUsage}){
 api.get('/vehicles/page',async(req,res)=>{
  const q=z.object({estateId:z.string().regex(/^[\w-]{1,100}$/),year:z.coerce.number().int().min(1900).max(2200),view:z.enum(['vehicles','transactions','items','usage']),vehicleId:z.string().max(100).optional(),category:z.string().max(100).optional(),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),q:z.string().max(160).default(''),cursor:z.string().max(5000).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)}).parse(req.query);
  if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);
  if(!await Estate.exists({_id:q.estateId}))throw new QueryError('Estate not found',404);
  if(q.month&&!q.month.startsWith(`${q.year}-`))throw new QueryError('Month must belong to the selected year');
  const imports=await VehicleImport.find({estateId:q.estateId,year:q.year,status:'complete'}).select('_id').limit(501).maxTimeMS(5000).lean();if(imports.length>500)throw new QueryError('Too many vehicle imports for this year',413);
  const where={estateId:q.estateId,year:q.year,importId:{$in:imports.map(r=>r._id)},...(q.vehicleId?{vehicleId:q.vehicleId}:{}),...(q.category?{category:q.category}:{}),...(q.month?{month:q.month}:{})};
  const usageWhere={estateId:q.estateId,workDate:{$gte:q.month?`${q.month}-01`:`${q.year}-01-01`,$lt:q.month?new Date(Date.UTC(q.year,Number(q.month.slice(5)),1)).toISOString().slice(0,10):`${q.year+1}-01-01`},...(q.vehicleId?{vehicleId:q.vehicleId}:{})};
  const join=[{$lookup:{from:Vehicle.collection.name,localField:'vehicleId',foreignField:'_id',as:'vehicle'}},{$set:{vehicleName:{$ifNull:[{$first:'$vehicle.name'},'$sourceVehicleLabel']},sourceIdentifier:{$first:'$vehicle.sourceIdentifier'},identityStatus:{$first:'$vehicle.identityStatus'}}},{$unset:'vehicle'}];
  const re={$regex:searchLiteral(q.q),$options:'i'};
  const fields=q.view==='vehicles'?['vehicleName','sourceIdentifier']:q.view==='usage'?['vehicleName','activityDescription','activityCode','task','blockCode']:['sourceVehicleLabel','description','itemName','transactionNo','employee'];
  if(q.view==='vehicles'&&q.q){const selected=await Vehicle.find({estateId:q.estateId,$or:[{name:re},{sourceIdentifier:re}]}).select('_id').limit(5001).maxTimeMS(5000).lean();if(selected.length>5000)throw new QueryError('Narrow the vehicle search',413);where.vehicleId={$in:selected.map(v=>v._id).filter(id=>!q.vehicleId||id===q.vehicleId)};}
  const base=[...(q.view==='usage'?join:[]),...(q.q&&q.view!=='vehicles'?[{$match:{$or:fields.map(k=>({[k]:re}))}}]:[])];
  if(q.view==='usage'){
   const result=await databasePage(VehicleUsage,usageWhere,{cursor:q.cursor,limit:q.limit,order:{workDate:-1,_id:1},pipeline:base,group:{count:{$sum:1},runningHours:{$sum:'$runningHours'},distanceKm:{$sum:'$distanceKm'},hoursKnown:{$sum:{$cond:[{$ne:[{$ifNull:['$runningHours',null]},null]},1,0]}},kmKnown:{$sum:{$cond:[{$ne:[{$ifNull:['$distanceKm',null]},null]},1,0]}}}});
   return res.json({...result,summary:{runningHours:result.hoursKnown?result.runningHours:null,distanceKm:result.kmKnown?result.distanceKm:null}});
  }
  let pipeline=base,order={date:1,_id:1};
  if(q.view==='vehicles'){pipeline=[...base,{$group:{_id:'$vehicleId',name:{$first:'$sourceVehicleLabel'},reportSequence:{$min:'$reportSequence'},amountMinor:{$sum:'$amountMinor'},transactionCount:{$sum:1},zeroAmountCount:{$sum:{$cond:[{$eq:['$amountMinor',0]},1,0]}}}}];order={reportSequence:1,_id:1};}
  if(q.view==='items'){pipeline=[...base,{$group:{_id:{category:'$category',subcategory:'$subcategory',itemName:'$itemName',quantityUnit:{$ifNull:['$quantityUnit','']}},amountMinor:{$sum:'$amountMinor'},transactionCount:{$sum:1},quantitySum:{$sum:'$quantity'},known:{$sum:{$cond:[{$ne:[{$ifNull:['$quantity',null]},null]},1,0]}},missingQuantityCount:{$sum:{$cond:[{$eq:[{$ifNull:['$quantity',null]},null]},1,0]}}}},{$set:{category:'$_id.category',subcategory:'$_id.subcategory',itemName:'$_id.itemName',quantityUnit:'$_id.quantityUnit',quantity:{$cond:[{$gt:['$known',0]},'$quantitySum',null]}}}];order={category:1,subcategory:1,itemName:1,quantityUnit:1};}
  const [result,totals]=await Promise.all([databasePage(VehicleTransaction,where,{cursor:q.cursor,limit:q.limit,order,pipeline}),VehicleTransaction.aggregate([{$match:where},...base,{$group:{_id:null,amountMinor:{$sum:'$amountMinor'},transactionCount:{$sum:1},vehicleIds:{$addToSet:'$vehicleId'},zeroAmountCount:{$sum:{$cond:[{$eq:['$amountMinor',0]},1,0]}}}},{$set:{vehicleCount:{$size:'$vehicleIds'}}},{$unset:['vehicleIds','_id']}]).option({maxTimeMS:10000,allowDiskUse:true})]);
  if(q.view==='vehicles'){
   const masters=new Map((await Vehicle.find({estateId:q.estateId,_id:{$in:result.items.map(r=>r._id)}}).select('name sourceIdentifier identityStatus').lean()).map(v=>[v._id,v]));
   result.items=result.items.map(r=>({...r,...masters.get(r._id)}));
   const usage=await VehicleUsage.aggregate([{$match:{...usageWhere,vehicleId:{$in:result.items.map(r=>r._id)}}},{$group:{_id:'$vehicleId',runningHours:{$sum:'$runningHours'},distanceKm:{$sum:'$distanceKm'},hoursKnown:{$sum:{$cond:[{$ne:[{$ifNull:['$runningHours',null]},null]},1,0]}},kmKnown:{$sum:{$cond:[{$ne:[{$ifNull:['$distanceKm',null]},null]},1,0]}}}}]).option({maxTimeMS:10000});
   const lookup=new Map(usage.map(r=>[r._id,r]));result.items=result.items.map(r=>({...r,runningHours:lookup.get(r._id)?.hoursKnown?lookup.get(r._id).runningHours:null,distanceKm:lookup.get(r._id)?.kmKnown?lookup.get(r._id).distanceKm:null}));
  }
  if(q.view==='transactions'){const names=new Map((await Vehicle.find({estateId:q.estateId,_id:{$in:result.items.map(r=>r.vehicleId)}}).select('name').lean()).map(v=>[v._id,v.name]));result.items=result.items.map(r=>({...r,vehicleName:names.get(r.vehicleId)||r.sourceVehicleLabel}));}
  if(q.view==='items')result.items=result.items.map(r=>({...r,id:JSON.stringify(r._id)}));
  res.json({...result,summary:totals[0]||{amountMinor:0,transactionCount:0,vehicleCount:0,zeroAmountCount:0},currency:'NGN',year:q.year});
 });
}
