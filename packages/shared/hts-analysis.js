import {allocateMinor} from './wages.js';
// These observed activity wages are a separate source basis from block allocations.
export const sum = (rows,key) => rows.reduce((n,r)=>n+(Number.isFinite(r[key])?r[key]:0),0);
export function wageAnalysis(rows,{year='2025',month='',task='',activity=''}={}) {
  const scope=rows.filter(r=>(!task||r.task===task)&&(!activity||r.activity===activity));
  const selected=scope.filter(r=>r.period.startsWith(String(year))&&(!month||r.period===month));
  const aggregate=rs=>({amountMinor:sum(rs,'amountMinor'),manDays:sum(rs,'manDays'),count:rs.length});
  const monthly=Array.from({length:12},(_,i)=>{
    const period=`${year}-${String(i+1).padStart(2,'0')}`,rs=scope.filter(r=>r.period===period);
    return {period,...aggregate(rs),...(!rs.length?{amountMinor:null,manDays:null}:{}),available:rs.length>0};
  });
  const annual=[...new Set(rows.map(r=>r.period.slice(0,4)))].sort().map(y=>{const rs=scope.filter(r=>r.period.startsWith(y)&&(!month||r.period.slice(5)===month.slice(5)));return {year:y,...aggregate(rs),...(!rs.length?{amountMinor:null,manDays:null}:{})};});
  const groups=new Map();
  for(const r of selected){const key=JSON.stringify([r.task,r.activity]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  const activities=[...groups.values()].map(rs=>({task:rs[0].task,activity:rs[0].activity,...aggregate(rs)})).sort((a,b)=>b.amountMinor-a.amountMinor);
  return {rows:selected,monthly,annual,activities,...aggregate(selected)};
}
export function fertiliserValue(row,products,product='solids') {
  const indices=products.map((p,i)=>i).filter(i=>product==='solids'?products[i].unit==='kg':String(i)===String(product));
  const values=indices.map(i=>row.quantities[i]);
  // Partial source quantities remain unknown rather than silently becoming zero.
  return values.length&&values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
}
export function fertiliserAnalysis(data,{year=2025,division='',block='',product='solids',metric='quantity'}={}) {
  const scope=data.fertiliser.filter(r=>(!division||r.division===division)&&(!block||r.mapBlockCode===block));
  const rows=scope.filter(r=>r.year===Number(year));
  const mapped=rows.filter(r=>r.mapBlockCode),unmapped=rows.filter(r=>!r.mapBlockCode);
  const palmsByBlock=new Map((data.blockPalms||[]).map(b=>[b.blockCode,b.totalPalms]));
  const kilograms=product==='solids'||data.products[Number(product)]?.unit==='kg';
  const group=new Map();
  for(const r of mapped){if(!group.has(r.mapBlockCode))group.set(r.mapBlockCode,[]);group.get(r.mapBlockCode).push(r);}
  const blocks=[...group].map(([mapBlockCode,rs])=>{
    const values=rs.map(r=>fertiliserValue(r,data.products,product));
    const quantity=values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
    const mapHa=rs[0].mapHa;
    const value=quantity===null?null:metric==='perPalm'?(kilograms&&palmsByBlock.get(mapBlockCode)>0?quantity/palmsByBlock.get(mapBlockCode):null):metric==='bags'?quantity/50:metric==='perHa'?(mapHa>0?quantity/mapHa:null):quantity;
    return {mapBlockCode,sourceBlocks:[...new Set(rs.map(r=>r.sourceBlockCode))],divisions:[...new Set(rs.map(r=>r.division))],quantity,value,mapHa,rows:rs};
  }).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));
  const annual=[...new Set(data.fertiliserSections.map(r=>r.year))].sort().map(y=>{
    const rs=scope.filter(r=>r.year===y&&r.mapBlockCode),values=rs.map(r=>fertiliserValue(r,data.products,product));
    const quantity=rs.length&&values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
    const areas=new Map(rs.map(r=>[r.mapBlockCode,r.mapHa]));const area=[...areas.values()].reduce((a,b)=>a+(b||0),0);
    return {year:y,count:rs.length,value:quantity===null?null:metric==='bags'?quantity/50:metric==='perHa'?(area>0?quantity/area:null):quantity};
  });
  const quantity=blocks.length&&blocks.every(b=>Number.isFinite(b.quantity))?sum(blocks,'quantity'):null;
  const counts=blocks.map(b=>palmsByBlock.get(b.mapBlockCode));
  const totalPalms=counts.length&&counts.every(p=>Number.isFinite(p)&&p>=0)?counts.reduce((a,b)=>a+b,0):null;
  const kgPerPalm=kilograms&&quantity!==null&&totalPalms>0?quantity/totalPalms:null;
  return {rows,mapped,unmapped,blocks,annual,quantity,area:sum(blocks,'mapHa'),totalPalms,kgPerPalm};
}

export const fertiliserColours=['#e7f2ee','#b6d9cc','#72b7a0','#2e8f72','#095b46'];
export function fertiliserPalmBands(max){
  const top=Math.max(1.5,Math.floor((max||0)*2)/2+0.5), edges=[0,1.5];
  for(let edge=2;edge<=top;edge+=0.5)edges.push(edge);
  return edges.slice(0,-1).map((min,i)=>{
    const t=1-Math.exp(-i/5), pos=t*4, a=Math.floor(pos), b=Math.min(4,a+1), mix=pos-a;
    const rgb=hex=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));
    const start=rgb(fertiliserColours[a]),end=rgb(fertiliserColours[b]);
    const color='#'+start.map((v,j)=>Math.round(v+(end[j]-v)*mix).toString(16).padStart(2,'0')).join('');
    return {min,max:edges[i+1],color,label:`${min}–${i===edges.length-2?'':'<'}${edges[i+1]}`};
  });
}
export function fertiliserColour(value,max,bands){
  if(bands?.length)return (!Number.isFinite(value)?bands[0]:bands.find((band,i)=>value<band.max||i===bands.length-1)).color;
  return !Number.isFinite(value)?'#e7e9ec':value===0?'#ffffff':fertiliserColours[Math.min(4,Math.max(0,Math.floor(value/(max||1)*5)))];
}
export function fertiliserMapLayer(analysis,{estateId,year,division='',productLabel,unit}){
  const values=Object.fromEntries(analysis.blocks.map(b=>[b.mapBlockCode,b.value]));
  const max=Math.max(0,...analysis.blocks.map(b=>b.value??0));
  return {kind:'fertiliser',estateId,values,blockCodes:analysis.blocks.map(b=>b.mapBlockCode),
    max,bands:unit==='kg/palm'?fertiliserPalmBands(max):null,unit,
    label:`${year} · ${division||'All divisions'} · ${productLabel}`};
}

// Annual block man-days determine each activity's share of monthly estate payroll.
export function allocateActivityWages(rows,mandays,mapCodes,block=''){
  const codes=new Set(mapCodes), groups=new Map(), available=new Set();
  for(const r of mandays||[]){
    if(r.year!==2025||!codes.has(r.mapBlockCode)||!Number.isSafeInteger(r.mandayUnits)||r.mandayUnits<=0)continue;
    const key=JSON.stringify([r.task,r.activity]);
    if(!groups.has(key))groups.set(key,new Map());
    // The imported annual table has one record per block/task/activity.
    if(!groups.get(key).has(r.mapBlockCode))groups.get(key).set(r.mapBlockCode,{_id:r.mapBlockCode,mapHa:r.mandayUnits});
    available.add(r.mapBlockCode);
  }
  const items=[];
  for(const r of rows){
    if(!r.period.startsWith('2025-')||!['HARVESTING','UPKEEP','LAND DEVELOPMENT'].includes(r.task))continue;
    const weights=[...(groups.get(JSON.stringify([r.task,r.activity]))?.values()||[])].sort((a,b)=>a._id.localeCompare(b._id));
    const totalUnits=sum(weights,'mapHa'),index=weights.findIndex(w=>w._id===block);
    if(!totalUnits||(block&&index<0))continue;
    const share=block?weights[index].mapHa/totalUnits:1;
    items.push({period:r.period,task:r.task,activity:r.activity,sourceSerial:r.sourceSerial,
      sourceFile:r.sourceFile,sourceSheet:r.sourceSheet,sourceRow:r.sourceRow,
      mapBlockCode:block||'All mapped blocks',allocationBasis:'2025 block man-days',allocationShare:share,
      amountMinor:block?allocateMinor(r.amountMinor,weights)[index]:r.amountMinor,
      manDays:Number.isFinite(r.manDays)?r.manDays*share:null});
  }
  return {rows:items,blockCodes:[...available].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))};
}
