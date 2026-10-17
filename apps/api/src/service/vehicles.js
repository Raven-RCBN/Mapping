import { z } from 'zod';
import { canAccess } from './auth.js';
import { QueryError } from './performance.js';

const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
const yearInput = z.coerce.number().int().min(1900).max(2200).default(2025);
const queries = z.object({
  year: yearInput, view: z.enum(['vehicles','transactions','items','usage']).default('vehicles'),
  vehicleId: id.optional(), category: z.string().max(100).optional(),
  subcategory: z.string().max(120).optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  q: z.string().trim().max(160).default(''), page: z.coerce.number().int().min(0).max(10000).default(0),
});
const publicRow = ({_id, ...row}) => ({...row,id:_id});
const sum = (rows, key) => rows.reduce((n,r)=>n+(r[key]??0),0);
const nullableTotal = (rows, key) => rows.some(r=>r[key]!=null) ? sum(rows,key) : null;

export function installVehicles(api, models) {
  const {Estate, Vehicle, VehicleTransaction, VehicleImport, VehicleUsage} = models;
  if (!Vehicle) return;
  const scope = async req => {
    const estateId = id.parse(req.query.estateId);
    if (!canAccess(req,estateId)) throw new QueryError('Estate access denied',403);
    if (!await Estate.exists({_id:estateId})) throw new QueryError('Estate not found',404);
    return estateId;
  };
  const reportsFor = (estateId, year) => VehicleImport.find({estateId,status:'complete',...(year?{year}:{})})
    .select('-headers -contentHash -sourcePath -importedBy').sort({year:-1}).limit(501).maxTimeMS(5000).lean();
  api.get('/vehicles/meta',async(req,res)=>{
    const estateId = await scope(req), year = yearInput.parse(req.query.year);
    const reports = await reportsFor(estateId);
    if(reports.length>500) throw new QueryError('Too many vehicle reports',413);
    const importIds = reports.filter(r=>r.year===year).map(r=>r._id);
    const where = {estateId,importId:{$in:importIds}};
    const [vehicleIds, categories] = await Promise.all([
      VehicleTransaction.distinct('vehicleId',where), VehicleTransaction.distinct('category',where),
    ]);
    const vehicles = await Vehicle.find({estateId,_id:{$in:vehicleIds}}).select('name sourceIdentifier identityStatus').sort({name:1}).limit(5001).lean();
    if(vehicles.length>5000) throw new QueryError('Too many vehicles',413);
    res.json({years:[...new Set(reports.map(r=>r.year))],vehicles:vehicles.map(publicRow),categories:categories.sort(),reports:reports.filter(r=>r.year===year).map(publicRow)});
  });
  api.get('/vehicles',async(req,res)=>{
    const estateId = await scope(req), q = queries.parse(req.query);
    if(q.month && !q.month.startsWith(`${q.year}-`)) throw new QueryError('Month must belong to the selected year',400);
    if(q.vehicleId && !await Vehicle.exists({_id:q.vehicleId,estateId})) throw new QueryError('Vehicle not found in this estate',404);
    const reports = await reportsFor(estateId,q.year);
    const where = {estateId,year:q.year,importId:{$in:reports.map(r=>r._id)},
      ...(q.vehicleId?{vehicleId:q.vehicleId}:{}), ...(q.month?{month:q.month}:{})};
    const all = await VehicleTransaction.find(where).sort({reportSequence:1,date:1,transactionSequence:1}).limit(50001).maxTimeMS(5000).lean();
    if(all.length>50000) throw new QueryError('Select a vehicle or month to narrow this report',413);
    const vehicleIds = [...new Set(all.map(r=>r.vehicleId))];
    const masters = await Vehicle.find({estateId,_id:{$in:vehicleIds}}).lean();
    const lookup = new Map(masters.map(v=>[v._id,v]));
    const search = q.q.toLowerCase();
    const usage = await VehicleUsage.find({estateId,workDate:{$gte:q.month?`${q.month}-01`:`${q.year}-01-01`,
      $lt:q.month?new Date(Date.UTC(q.year,Number(q.month.slice(5)),1)).toISOString().slice(0,10):`${q.year+1}-01-01`},
      ...(q.vehicleId?{vehicleId:q.vehicleId}:{})}).sort({workDate:-1,_id:1}).limit(50001).maxTimeMS(5000).lean();
    if(usage.length>50000) throw new QueryError('Select a vehicle or month to narrow usage records',413);
    const matchText = r => !search || [r.sourceVehicleLabel,r.description,r.itemName,r.transactionNo,r.employee].join(' ').toLowerCase().includes(search);
    const costs = all.filter(r=>(!q.category||r.category===q.category)&&(!q.subcategory||r.subcategory===q.subcategory)&&
      (q.view==='vehicles'?(!search||lookup.get(r.vehicleId)?.name.toLowerCase().includes(search)):matchText(r)));
    let items;
    if(q.view==='vehicles') {
      const grouped = new Map();
      for(const r of costs) {
        if(!grouped.has(r.vehicleId)) grouped.set(r.vehicleId,{...publicRow(lookup.get(r.vehicleId)),reportSequence:r.reportSequence,transactionCount:0,amountMinor:0,zeroAmountCount:0});
        const v=grouped.get(r.vehicleId);v.transactionCount++;v.amountMinor+=r.amountMinor;v.zeroAmountCount+=r.amountMinor===0?1:0;
      }
      items = [...grouped.values()].sort((a,b)=>a.reportSequence-b.reportSequence).map(v=>{
        const records=usage.filter(r=>r.vehicleId===v.id);
        return {...v,usageRecords:records.length,runningHours:nullableTotal(records,'runningHours'),distanceKm:nullableTotal(records,'distanceKm')};
      });
    } else if(q.view==='items') {
      const grouped = new Map();
      for(const r of costs) {
        const key=JSON.stringify([r.category,r.subcategory,r.itemName,r.quantityUnit]);
        if(!grouped.has(key)) grouped.set(key,{id:key,category:r.category,subcategory:r.subcategory,itemName:r.itemName,
          quantityUnit:r.quantityUnit,quantity:null,missingQuantityCount:0,transactionCount:0,amountMinor:0,zeroAmountCount:0});
        const row=grouped.get(key);row.transactionCount++;row.amountMinor+=r.amountMinor;row.zeroAmountCount+=r.amountMinor===0?1:0;
        if(r.quantity==null)row.missingQuantityCount++;else row.quantity=(row.quantity??0)+r.quantity;
      }
      items=[...grouped.values()].sort((a,b)=>a.category.localeCompare(b.category)||a.subcategory.localeCompare(b.subcategory)||a.itemName.localeCompare(b.itemName));
    } else if(q.view==='usage') {
      // Future activity usage is a separate ledger, including vehicles with no costs.
      const ids=[...new Set(usage.map(r=>r.vehicleId))];
      const names=new Map((await Vehicle.find({estateId,_id:{$in:ids}}).select('name').lean()).map(r=>[r._id,r.name]));
      items=usage.map(r=>({...publicRow(r),vehicleName:names.get(r.vehicleId)||r.vehicleId})).filter(r=>!search||[r.vehicleName,r.activityDescription,r.activityCode,r.task,r.blockCode].join(' ').toLowerCase().includes(search));
    } else items=costs.map(r=>({...publicRow(r),vehicleName:lookup.get(r.vehicleId)?.name||r.sourceVehicleLabel}));
    const summary = q.view==='usage'?{runningHours:nullableTotal(items,'runningHours'),distanceKm:nullableTotal(items,'distanceKm')}:
      {amountMinor:sum(costs,'amountMinor'),transactionCount:costs.length,vehicleCount:new Set(costs.map(r=>r.vehicleId)).size,
        zeroAmountCount:costs.filter(r=>r.amountMinor===0).length};
    res.json({items:items.slice(q.page*25,(q.page+1)*25),count:items.length,page:q.page,pageSize:25,summary,
      reports:reports.map(publicRow),year:q.year,currency:'NGN'});
  });
}
