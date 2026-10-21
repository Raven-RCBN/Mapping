// Read-only reconciliation, including source blocks intentionally excluded from import.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const release=process.env.MAPPING_RELEASE,root=process.env.DATA_DIR+'/estates/673eebaf-1532-4590-9957-537373f1928d/imports/iplant-20261021',eid='673eebaf-1532-4590-9957-537373f1928d';
const {default:mongoose}=await import(pathToFileURL(path.join(release,'apps/api/node_modules/mongoose/index.js'))),{createModels}=await import(pathToFileURL(path.join(release,'apps/api/src/model/index.js')));
const read=async n=>JSON.parse(await fs.readFile(path.join(root,n+'.json'),'utf8')),trim=v=>String(v??'').trim();
const [source,master,crops,prior]=await Promise.all(['Checkroll.CropStatement','General.BlockMaster','General.CropYield','production-block-month-audit-20261021'].map(read));
const conn=await mongoose.createConnection(process.env.MONGODB_URI).asPromise();try{
const m=createModels(conn),[names,monthly,yearly,blocks]=await Promise.all(['ProductionName','MonthlyProduction','YearlyProduction','Block'].map(k=>m[k].find({estateId:eid}).lean()));
const links=new Map(names.filter(n=>n.sourceSqlBlockId&&n.mapBlockCode).map(n=>[trim(n.sourceSqlBlockId),n])),masters=new Map(master.map(b=>[trim(b.BlockID),b])),products=new Map(crops.map(c=>[trim(c.CropYieldID),trim(c.CropYieldCode)])),namesById=new Map(names.map(n=>[String(n._id),n]));
const totals=new Map(),months=new Map(),sourceBlocks=new Map();
const empty=key=>({key,sourceFfb:0,mappedFfb:0,excludedFfb:0,sourceLoose:0,mappedLoose:0,excludedLoose:0,webFfb:0,webLoose:0,webAnnualFfb:0,rows:0});
const get=(map,key)=>{if(!map.has(key))map.set(key,empty(key));return map.get(key)};
for(const r of source){const date=r.DDate?new Date(r.DDate).toISOString().slice(0,10):null,month=date?.slice(0,7)||'undated',year=date?.slice(0,4)||'undated',id=trim(r.BlockID),link=links.get(id),product=products.get(trim(r.CropYieldID)),grams=Math.round(Number(r.MilWeight||0)*1000);if(!['FFB','Loose Fruits'].includes(product))throw Error('Unexpected product '+product);
 const metric=product==='FFB'?'Ffb':'Loose';const b=get(sourceBlocks,id);b.sourceBlock=masters.get(id)?.BlockName||'(unknown BlockID)';b.mapBlock=link?.mapBlockCode||null;b.linkMethod=link?.linkMethod||'excluded';b.firstMonth=b.firstMonth&&b.firstMonth<month?b.firstMonth:month;b.lastMonth=b.lastMonth&&b.lastMonth>month?b.lastMonth:month;
 for(const g of [get(totals,year),get(months,month),b]){g.rows++;g['source'+metric]+=grams;g[(link?'mapped':'excluded')+metric]+=grams;}}
for(const r of monthly){const n=namesById.get(String(r.sourceBlockId)),year=r.month.slice(0,4),b=get(sourceBlocks,trim(n?.sourceSqlBlockId||'unknown-web-source'));for(const g of [get(totals,year),get(months,r.month),b]){g.webFfb+=Math.round(Number(r.mt||0)*1e6);g.webLoose+=Math.round(Number(r.looseFruitMt||0)*1e6);}}
for(const r of yearly)get(totals,String(r.year)).webAnnualFfb+=Math.round(Number(r.mt||0)*1e6);
const convert=g=>({...g,...Object.fromEntries(Object.entries(g).filter(([k])=>/Ffb$|Loose$/.test(k)).map(([k,v])=>[k+'Mt',v/1e6])),differenceFfbMt:(g.sourceFfb-g.webFfb)/1e6,mappedDifferenceFfbMt:(g.mappedFfb-g.webFfb)/1e6,differenceLooseMt:(g.sourceLoose-g.webLoose)/1e6});
const sourceTargets=new Map();for(const n of links.values()){if(!sourceTargets.has(n.mapBlockCode))sourceTargets.set(n.mapBlockCode,[]);sourceTargets.get(n.mapBlockCode).push(n.sourceBlockCode)}
const report={checkedAt:new Date().toISOString(),sourceDigest:prior.sourceDigest,previousAuditVerified:prior.verified,sourceMasterBlocks:master.length,mappedSourceBlocks:links.size,excludedMasterBlocks:master.filter(b=>!links.has(trim(b.BlockID))).map(b=>b.BlockName),mappingCollisions:[...sourceTargets].filter(([,v])=>v.length>1),mappedTargetsMissingFromRegistry:[...sourceTargets.keys()].filter(code=>!blocks.some(b=>b.blockCode===code)),years:[...totals.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(convert),months:[...months.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(convert),blocks:[...sourceBlocks.values()].map(convert).sort((a,b)=>b.differenceFfbMt-a.differenceFfbMt)};
report.verified=prior.verified&&report.years.every(y=>y.mappedDifferenceFfbMt===0&&y.webFfb===y.webAnnualFfb)&&report.mappingCollisions.length===0&&report.mappedTargetsMissingFromRegistry.length===0;
await fs.writeFile(path.join(root,'estate-production-reconciliation-20261021.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({...report,months:undefined,blocks:report.blocks.filter(b=>!b.mapBlock||b.mappedDifferenceFfbMt!==0)}));
}finally{await conn.close()}
