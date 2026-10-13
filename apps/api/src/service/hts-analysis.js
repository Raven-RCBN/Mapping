import fs from 'node:fs/promises';
import path from 'node:path';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
export function installHtsAnalysis(api,models,config){
  api.get('/hts-analysis',async(req,res)=>{
    const estateId=String(req.query.estateId||'');
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(estateId))throw new QueryError('Select an estate',400);
    if(!canAccess(req,estateId))throw new QueryError('Estate access denied',403);
    if(!await models.Estate.exists({_id:estateId}))throw new QueryError('Estate not found',404);
    let snapshot;
    try{snapshot=JSON.parse(await fs.readFile(path.join(config.dataDir,'hts-analysis',estateId+'.json'),'utf8'));}
    catch(e){if(e.code==='ENOENT')throw new QueryError('HTS analysis has not been prepared for this estate',404);throw e;}
    if(snapshot.estateId!==estateId)throw new QueryError('HTS snapshot estate mismatch',409);
    const blockMandays=models.BlockManday?await models.BlockManday.find({estateId,year:2025})
      .select('year mapBlockCode task activity mandayUnits -_id').limit(50001).lean():[];
    if(blockMandays.length>50000)throw new QueryError('Too many block man-day records',413);
    snapshot.blockMandays=blockMandays;
    const blockPalms=models.Block?await models.Block.find({estateId})
      .select('blockCode totalPalms -_id').limit(5001).lean():[];
    if(blockPalms.length>5000)throw new QueryError('Too many block palm records',413);
    snapshot.blockPalms=blockPalms;
    res.set('Cache-Control','private, no-store').json(snapshot);
  });
}
