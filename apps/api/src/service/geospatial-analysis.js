import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
import {secureStoredFile} from './files.js';
export function installGeospatialAnalysis(api,models,config){
  async function scope(req){
    const estateId=String(req.query.estateId||'');
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(estateId))throw new QueryError('Select a location.',400);
    if(!canAccess(req,estateId))throw new QueryError('Location access denied.',403);
    return estateId;
  }
  api.get('/geospatial-analysis',async(req,res)=>{
    const estateId=await scope(req);
    const reports=await models.GeospatialReport.find({estateId}).select('-files').sort({surveyDate:-1,_id:1}).limit(101).lean();
    if(reports.length>100)throw new QueryError('Too many survey reports; narrow the survey archive.',413);
    res.set('Cache-Control','private, no-store').json({reports});
  });
  api.get('/geospatial-analysis/rows',async(req,res)=>{
    const estateId=await scope(req),reportId=String(req.query.reportId||''),page=Number(req.query.page||1),pageSize=Number(req.query.pageSize||25);
    if(!Number.isInteger(page)||page<1||page>10000||![25,50,100].includes(pageSize))throw new QueryError('Invalid page.',400);
    const filter={estateId,reportId};
    const section=String(req.query.section||'inventory');
    if(!['inventory','density','growth','priority','highlight'].includes(section))throw new QueryError('Invalid analysis section.',400);
    if(['density','growth'].includes(section))filter.totalPalms={$ne:null};
    if(section==='priority')filter.priority=true;
    if(section==='highlight')filter.highlight=true;
    const [items,total]=await Promise.all([models.GeospatialRow.find(filter).sort({sourceRow:1,_id:1}).skip((page-1)*pageSize).limit(pageSize).lean(),models.GeospatialRow.countDocuments(filter)]);
    res.set('Cache-Control','private, no-store').json({items,total,page,pageSize});
  });
  api.get('/geospatial-analysis/file/:reportId/:key',async(req,res)=>{
    const estateId=await scope(req);
    const report=await models.GeospatialReport.findOne({_id:req.params.reportId,estateId}).select('files').lean();
    const file=report?.files?.find(f=>f.key===req.params.key);
    if(!file)throw new QueryError('Survey file not found.',404);
    const filename=await secureStoredFile(config.dataDir,file.path);
    if(!file.path.startsWith(`estates/${estateId}/`))throw new QueryError('Survey file location mismatch.',409);
    res.set('Cache-Control','private, no-store').type(file.mime).sendFile(filename);
  });
}
