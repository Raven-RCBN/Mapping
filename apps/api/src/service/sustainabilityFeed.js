// Installed in MapIntel's independent server. This credential exposes only the
// OBAN read-only feed; it is never accepted by Mapping's general API or writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validFeedToken } from './sustainabilityFeedAuth.js';
export const OBAN_ESTATE_ID = 'f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae';
export function installSustainabilityFeed(app, {express, models, dataDir, readMosaicTile, secureStoredFile, token = process.env.SUSTAINABILITY_FEED_TOKEN}) {
  if (!token) return;
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid Sustainability feed credential');
  const router=express.Router(), estateId=OBAN_ESTATE_ID;
  const active={storageState:{$nin:['retired','purging','purged','restoring']}};
  const wrap=handler=>(req,res,next)=>Promise.resolve(handler(req,res)).catch(next);
  router.use((req,res,next)=>{
    res.set('Cache-Control','private, no-store');
    if (!validFeedToken(req.get('authorization'),token)) return res.status(401).json({message:'Authenticated Sustainability connection required.'});
    if(req.method!=='GET') return res.sendStatus(405);
    next();
  });
  router.get('/',wrap(async(req,res)=>{
    const [estate,names,production,assets,rainfall]=await Promise.all([
      models.Estate.findById(estateId).lean(),
      models.ProductionName.find({estateId}).select('-history').limit(5001).lean(),
      models.YearlyProduction.find({estateId}).select('-history').limit(5001).lean(),
      models.Asset.find({estateId,...active}).select('-archiveId').limit(201).lean(),
      models.AnnualRainfall.find({estateId,active:true}).sort({year:1}).limit(501).lean(),
    ]);
    if(!estate?.boundary?.features?.length) return res.status(503).json({message:'OBAN boundary is unavailable in MapIntel.'});
    if(names.length>5000||production.length>5000||assets.length>200||rainfall.length>500) return res.sendStatus(413);
    const landAsset=assets.find(a=>a.kind==='vector'&&a.layerType==='land-use');
    const mosaic=assets.find(a=>a.kind==='reference-image'&&a.mosaic?.levels?.length);
    if(!landAsset||!mosaic)return res.status(503).json({message:'OBAN land-use or mosaic source is unavailable in MapIntel.'});
    const landUse=JSON.parse(await fs.readFile(await secureStoredFile(dataDir,landAsset.file.path),'utf8'));
    const operationsFile=await secureStoredFile(dataDir,`hts-analysis/${estateId}.json`);
    const operations=JSON.parse(await fs.readFile(operationsFile,'utf8'));
    if(operations.estateId!==estateId)throw Error('OBAN operational source mismatch');
    const nm=new Map(names.map(n=>[n._id,n]));
    const records=production.map(r=>{const n=nm.get(r.sourceBlockId);return {sourceBlock:n?.sourceBlockCode||'',block:n?.mapBlockCode||null,linkMethod:n?.linkMethod||'unmapped',year:r.year,period:r.periodLabel,status:r.receiptStatus,mt:r.mt,bunches:r.bunches,effectiveHa:r.effectiveHa,yieldAreaHa:r.effectiveHa,sourceSheet:r.sourceSheet,sourceRow:r.sourceRow};});
    const imagery=assets.filter(a=>a.kind==='imagery'&&/^\d{4}-\d{2}-\d{2}/.test(a.acquiredAt||'')).sort((a,b)=>a.acquiredAt.localeCompare(b.acquiredAt)).map(a=>({date:a.acquiredAt.slice(0,10),assetId:a._id,cloud:a.cloudPercent??null,bounds:a.bounds,pixelSpacing:a.resolution??null,attribution:a.attribution||'MapIntel source imagery'}));
    const newest=production.filter(r=>r.receiptStatus==='received').map(r=>r.month).sort().at(-1);
    const sourceRevision=createHash('sha256').update(JSON.stringify([estate.updatedAt,names.map(n=>[n._id,n.updatedAt,n.revision]),production.map(r=>[r._id,r.updatedAt,r.revision]),assets.map(a=>[a._id,a.updatedAt,a.file?.sha256]),rainfall.map(r=>[r._id,r.updatedAt]),(await fs.stat(operationsFile)).mtimeMs])).digest('hex');
    res.json({data:{version:2,estateId,estateName:'OBAN · Nigeria',mode:'Connected to MapIntel',sourceOrigin:'https://mapintel.agrinexus.ai',importedAt:new Date().toISOString(),sourceRevision,productionAsOf:newest?new Date(Date.UTC(Number(newest.slice(0,4)),Number(newest.slice(5,7)),0)).toISOString().slice(0,10):null,productionSource:production[0]?.sourceFile||'MapIntel annual production records',boundaries:estate.boundary,landUse,records,fertiliser:operations.fertiliser,products:operations.products,fertiliserUnitBasis:operations.unitBasis,rainfall,rainfallSource:'MapIntel active estate rainfall records',imagery,imageryCaveat:'Individual dated optical acquisitions. Clouds, shadow and seasonal appearance may resemble change; no automatic cleared-area estimate is inferred.',mosaic:{levels:mosaic.mosaic.levels.map(({cols,rows,xmin,ymin,xmax,ymax})=>({cols,rows,xmin,ymin,xmax,ymax})),sha256:mosaic.mosaic.sha256,date:mosaic.acquiredAt||null,pixelsBottomUp:false,attribution:mosaic.attribution||'OBAN supplied CarryMap mosaic'},sources:[{file:'MapIntel live database and active asset registry',sha256:sourceRevision},{file:'OBAN land-use layer',sha256:landAsset.file.sha256},{file:'OBAN mosaic',sha256:mosaic.mosaic.sha256}]}});
  }));
  router.get('/images/:date',wrap(async(req,res)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date))return res.sendStatus(400);
    const asset=await models.Asset.findOne({estateId,...active,kind:'imagery',acquiredAt:{$gte:req.params.date,$lt:req.params.date+'T~'}}).sort({acquiredAt:1}).lean();
    if(!asset)return res.sendStatus(404);
    res.type(asset.file.mime||'image/png').sendFile(await secureStoredFile(dataDir,asset.file.path));
  }));
  router.get('/tiles/:z/:x/:y',wrap(async(req,res)=>{
    const coordinates=[req.params.z,req.params.x,req.params.y];
    if(!coordinates.every(v=>/^\d{1,3}$/.test(v)))return res.sendStatus(400);
    const asset=await models.Asset.findOne({estateId,...active,kind:'reference-image','mosaic.levels.0':{$exists:true}}).lean();
    if(!asset)return res.sendStatus(404);
    const bytes=await readMosaicTile(dataDir,asset.mosaic,...coordinates.map(Number));
    if(!bytes)return res.sendStatus(404);
    res.type('png').send(bytes);
  }));
  app.use('/api/EstateAtlas/integrations/sustainability/oban',router);
}
