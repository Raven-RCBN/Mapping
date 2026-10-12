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
    res.set('Cache-Control','private, no-store').json(snapshot);
  });
}
