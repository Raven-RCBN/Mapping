// Read-only local preview using supplied estate fixtures. No database writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import express from '../apps/api/node_modules/express/index.js';
import {installEstateAI} from '../apps/api/src/service/ai/index.js';
import {evidenceFromRows} from '../apps/api/src/service/ai/context.js';
import {allocateWages} from '../packages/shared/wages.js';
import {createServer} from '../apps/web/node_modules/vite/dist/node/index.js';
const root=path.resolve(import.meta.dirname,'..');
const load=async name=>JSON.parse(await fs.readFile(path.join(root,'data',name),'utf8'));
const [production,rainfall,hts,gis,payroll]=await Promise.all([load('production/oban-production.json'),load('rainfall/oban-rainfall-through-sep2026.json'),load('hts-analysis/oban.json'),load('estates/oban-nigeria/gis-import.json'),load('wages/oban-wages-2025.json')]);
const names=new Map(production.names.map(n=>[n._id,n]));
const items=production.monthly.map(r=>({...r,sourceBlockCode:names.get(r.sourceBlockId)?.sourceBlockCode,mapBlockCode:names.get(r.sourceBlockId)?.mapBlockCode}));
const vite=await createServer({root:path.join(root,'apps/web'),server:{middlewareMode:true,hmr:false},appType:'mpa'});
const ai=express();
ai.use(express.json({limit:'20kb'}));
ai.use((req,res,next)=>{req.access={subject:'local-preview',role:'admin',estateIds:[hts.estateId]};res.setHeader('Cache-Control','no-store');next();});
const aiRouter=express.Router();
installEstateAI(aiRouter,{}, {dataDir:path.join(root,'data'),aiEnv:{MAPPING_AI_STATE_DIR:'/tmp/mapping-oban-ai-preview'},aiEvidence:async block=>evidenceFromRows(production.monthly,production.names,await load('yield-models/'+hts.estateId+'.json'),block)});
ai.use('/api',aiRouter);
ai.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');let data;
 if(url.pathname.startsWith('/api/ai/')){ai(req,res);return;}
 if(url.pathname==='/api/production/decision-support'){const latest=items.filter(r=>r.receiptStatus==='received'&&Number.isFinite(r.mt)&&r.mt>=0&&r.month<new Date().toISOString().slice(0,7)).map(r=>r.month).sort().at(-1);const [y,m]=latest.split('-').map(Number);const start=new Date(Date.UTC(y,m-15,1)).toISOString().slice(0,7);data={items:items.filter(r=>r.month>=start&&r.month<=latest).map(({sourceBlockId,month,receiptStatus,mt,effectiveHa,plantingYear,sourceBlockCode,mapBlockCode})=>({sourceBlockId,month,receiptStatus,mt,effectiveHa,plantingYear,sourceBlockCode,mapBlockCode})),rainfall:rainfall.records};}
 if(url.pathname==='/api/production/recorded')data={items};
 if(url.pathname==='/api/hts-analysis')data={...hts,blockPalms:gis.blocks.map(b=>({blockCode:b.blockCode,totalPalms:b.totalPalms})),rainfall:rainfall.records};
 if(url.pathname==='/api/production/yearly')data={items:production.yearly.map(r=>({...r,mapBlockCode:names.get(r.sourceBlockId)?.mapBlockCode}))};
 if(url.pathname==='/api/yield-model'){try{data=await load('yield-models/'+hts.estateId+'.json');try{data.experimental=await load('yield-models/'+hts.estateId+'.experimental.json');}catch{}}catch{data={status:'unavailable',message:'Model training has not completed yet.'};}}
 if(url.pathname==='/api/decision-weather')data={status:'not_configured',message:'Local preview: no weather provider is connected.'};
 if(url.pathname==='/api/wages/meta')data={years:[...new Set(payroll.records.map(r=>r.period.slice(0,4)))]};
 if(url.pathname==='/api/wages/allocation'){
  const q=url.searchParams,year=q.get('year'),block=q.get('mapBlockCode');
  const wages=payroll.records.filter(r=>r.period.startsWith(year)&&r.basis===q.get('basis')&&r.task===q.get('task')&&r.activity===q.get('activity'));
  const areas=payroll.areas.filter(a=>a.year===Number(year));
  const allocation=allocateWages(wages,areas,block),byPeriod=new Map();
  for(const r of allocation.items)byPeriod.set(r.period,(byPeriod.get(r.period)||0)+r.amountMinor);
  data={count:allocation.items.length,amountMinor:allocation.items.reduce((n,r)=>n+r.amountMinor,0),byPeriod:[...byPeriod].map(([name,amountMinor])=>({name,amountMinor})),selectedAreas:areas.filter(a=>a.mapBlockCode===block)};
 }
 if(url.pathname.startsWith('/api/')&&!data){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'This data is not available in the local preview.'}));return;}
 if(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
 vite.middlewares(req,res);
});
server.listen(4199,'127.0.0.1',()=>console.log('Decision Support preview: http://127.0.0.1:4199/fertiliser-preview.html?view=decisions'));
process.on('SIGTERM',async()=>{server.close();await vite.close();process.exit(0);});
