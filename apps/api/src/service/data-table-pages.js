import {estateCurrency} from './estate-currency.js';
import {z} from 'zod';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
import {databasePage,searchLiteral} from './table-pages.js';
import {productionView} from './production.js';
const input=z.object({estateId:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),year:z.string().regex(/^\d{4}$/).optional(),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),basis:z.enum(['monthly','annual_summary']).default('monthly'),mapBlockCode:z.string().max(200).optional(),division:z.string().max(200).optional(),match:z.enum(['all','mapped','unmapped','differences','group']).default('all'),q:z.string().max(160).default(''),cursor:z.string().max(5000).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)});
export function installDataTablePages(api,models){
 const {Estate,ProductionName,Block,MonthlyProduction,YearlyProduction,ProductionComment,Wage,WageArea}=models;
 api.get('/data-tables/:kind',async(req,res)=>{
  const q=input.parse(req.query),kind=z.enum(['monthly','yearly','names','comments','wages','areas']).parse(req.params.kind);
  if(!canAccess(req,q.estateId))throw new QueryError('Estate access denied',403);
  if(!await Estate.exists({_id:q.estateId}))throw new QueryError('Estate not found',404);
  const regex={$regex:searchLiteral(q.q),$options:'i'},where={estateId:q.estateId};let Model,order={_id:1},transform=r=>r,extra={};
  if(['monthly','yearly','comments'].includes(kind)){
   const [names,blocks]=await Promise.all([ProductionName.find({estateId:q.estateId}).select('-history').limit(5001).maxTimeMS(5000).lean(),Block.find({estateId:q.estateId}).select('blockCode totalPalms surveyDate gisAreaHa').limit(5001).maxTimeMS(5000).lean()]);
   if(names.length>5000||blocks.length>5000)throw new QueryError('Select an estate with fewer than 5,000 block names',413);
   const bm=new Map(blocks.map(b=>[b.blockCode,b])),nm=new Map(names.map(n=>[n._id,n]));
   const chosen=names.filter(n=>(!q.mapBlockCode||n.mapBlockCode===q.mapBlockCode)&&(q.match!=='mapped'||n.mapBlockCode)&&(q.match!=='unmapped'||!n.mapBlockCode)&&(kind==='comments'||!q.q||[n.sourceBlockCode,n.mapBlockCode,n.division].join(' ').toLowerCase().includes(q.q.toLowerCase())));
   where.sourceBlockId={$in:chosen.map(n=>n._id)};
   if(kind==='comments'){
    Model=ProductionComment;const years=await Model.distinct('year',where);extra.years=years.sort((a,b)=>b-a);const year=q.year?Number(q.year):extra.years[0];where.year=year??-1;extra.year=year??null;
    if(q.q)where.$or=[{comment:regex},{sourceBlockId:{$in:chosen.filter(n=>[n.sourceBlockCode,n.mapBlockCode,n.division].join(' ').toLowerCase().includes(q.q.toLowerCase())).map(n=>n._id)}}];
    transform=r=>({...r,sourceBlockCode:nm.get(r.sourceBlockId)?.sourceBlockCode,division:nm.get(r.sourceBlockId)?.division,mapBlockCode:nm.get(r.sourceBlockId)?.mapBlockCode});order={sourceBlockId:1,_id:1};
   }else{
    Model=kind==='yearly'?YearlyProduction:MonthlyProduction;
    const periods=await Model.distinct(kind==='yearly'?'year':'month',{estateId:q.estateId});extra.periods=periods.map(String).sort().reverse();
    const period=kind==='yearly'?q.year:q.month;
    const latestReceived=kind==='monthly'&&!period?await Model.findOne({estateId:q.estateId,receiptStatus:'received'}).sort({month:-1}).select('month').maxTimeMS(5000).lean():null;
    const defaultPeriod=latestReceived?.month||extra.periods[0]||'';
    if(kind==='monthly'&&q.year&&!q.month)where.month={$gte:q.year+'-01',$lte:q.year+'-12'};
    else if(kind==='yearly')where.year=Number(period||extra.periods[0]||-1);else where.month=period||defaultPeriod||'none';
    extra.period=period||defaultPeriod;
    if(q.match==='differences')where.$or=chosen.filter(n=>n.linkMethod!=='shared_polygon'&&bm.get(n.mapBlockCode)?.totalPalms!=null).map(n=>({sourceBlockId:n._id,workbookPalms:{$type:'number',$ne:bm.get(n.mapBlockCode).totalPalms}}));
    if(q.match==='differences'&&!where.$or.length)where._id='__no_matches__';if(where.$or?.length===0)delete where.$or;
    order=kind==='yearly'?{sourceBlockId:1,_id:1}:{month:-1,sourceBlockId:1,_id:1};transform=r=>productionView(r,nm.get(r.sourceBlockId),bm.get(nm.get(r.sourceBlockId)?.mapBlockCode));
   }
  }else if(kind==='names'){
   Model=ProductionName;order={sourceBlockCode:1,_id:1};if(q.q)where.$or=['sourceBlockCode','mapBlockCode','division'].map(k=>({[k]:regex}));if(q.match==='mapped')where.mapBlockCode={$ne:null};if(q.match==='unmapped')where.mapBlockCode=null;
  }else{
   Model=kind==='wages'?Wage:WageArea;if(!q.year)throw new QueryError('Select a year');
   if(kind==='wages'){extra.currency=await estateCurrency(Estate,q.estateId,[Wage]);where.basis=q.basis;where.period={$gte:q.year,$lt:String(Number(q.year)+1)};order={period:1,_id:1};}
   else{where.year=Number(q.year);order={sourceBlockCode:1,_id:1};}
   if(q.division)where.division=q.division;
   if(q.match==='mapped')where.mapBlockCode={$ne:null};
   if(q.match==='unmapped'){where.mapBlockCode=null;if(kind==='wages')where.sourceBlockCode={$ne:null};}
   if(q.match==='group'){if(kind==='wages')where.sourceBlockCode=null;else where.$or=[{mapHa:null},{division:'DIVISION NOT SET'}];}
   if(q.q){const text={$or:['task','activity','division','sourceBlockCode','mapBlockCode'].map(k=>({[k]:regex}))};where.$and=[text];}
  }
  const result=await databasePage(Model,where,{cursor:q.cursor,limit:q.limit,order,group:{count:{$sum:1},...(kind==='wages'?{amountMinor:{$sum:'$amountMinor'}}:{})}});
  res.json({...result,...extra,items:result.items.map(transform)});
 });
}
