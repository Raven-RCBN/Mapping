import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import multer from 'multer';
import {permitted} from '../../../../packages/shared/access.js';
import {canAccess} from './auth.js';
import {QueryError} from './performance.js';
import {secureStoredFile,fileHash,ingestImage} from './files.js';

export const documentExtensions=new Set(['pdf','png','jpg','jpeg','webp','tif','tiff','xlsx','xls','csv','tsv']);
const extractor=fileURLToPath(new URL('../../scripts/extract-upload.py',import.meta.url));
export function runExtraction(input,output,extension,python=process.env.DOCUMENT_IMPORT_PYTHON||'python3',extra=[]){
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[extractor,input,output,extension,...extra],{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',tooLarge=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),480000);
    child.stdout.on('data',b=>{stdout+=b;if(stdout.length>1000000){tooLarge=true;child.kill('SIGKILL');}});
    child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0||tooLarge)return reject(Error(stderr.split('\n').filter(Boolean).at(-1)||'Extraction timed out or exceeded limits. Split the document.'));try{resolve(JSON.parse(stdout));}catch{reject(Error('Invalid extraction result.'));}});
  });
}
export function installDocumentImports(api,models,config){
  const {DocumentImport,DocumentRow,Estate}=models;
  if(!DocumentImport||!DocumentRow)return;
  const root=path.resolve(config.dataDir),staging=path.join(root,'.document-staging');
  const ready=fs.mkdir(staging,{recursive:true,mode:0o700});
  const upload=multer({dest:staging,limits:{fileSize:200*1024*1024,files:1,fields:4,fieldSize:1000}}).single('file');
  let working=false, uploads=0;
  async function worker(){
    if(working)return; working=true;
    let job;
    try{
      await DocumentImport.updateMany({status:'publishing',leaseUntil:{$lt:new Date()}},{$set:{status:'review'},$unset:{leaseUntil:1}});
      job=await DocumentImport.findOneAndUpdate({$or:[{status:'queued'},{status:'extracting',leaseUntil:{$lt:new Date()}}]},{$set:{status:'extracting',leaseUntil:new Date(Date.now()+600000)}},{sort:{createdAt:1},new:true}).lean();
      if(!job)return;
      await DocumentRow.deleteMany({importId:job._id,estateId:job.estateId});
      const input=await secureStoredFile(root,job.filePath),output=path.join(path.dirname(input),'extracted.ndjson');
      const result=await runExtraction(input,output,job.extension);
      const lines=createInterface({input:createReadStream(output),crlfDelay:Infinity});let batch=[],n=0;
      try{for await(const line of lines){const row=JSON.parse(line);batch.push({_id:`${job._id}-${++n}`,estateId:job.estateId,importId:job._id,sequence:n,...row,highlight:true,issues:['Extracted source data: review before reporting.']});if(batch.length===250){await DocumentRow.insertMany(batch);batch=[];}}if(batch.length)await DocumentRow.insertMany(batch);}finally{lines.close();}
      await DocumentImport.updateOne({_id:job._id,status:'extracting'},{$set:{status:'review',rowCount:n,sheets:result.sheets,warnings:result.warnings,error:null},$unset:{leaseUntil:1}});
    }catch(e){if(job)await DocumentImport.updateOne({_id:job._id},{$set:{status:'failed',error:String(e.message).slice(0,2000)},$unset:{leaseUntil:1}}).catch(()=>{});}
    finally{working=false;}
  }
  // DB leases recover interrupted extraction. Timers do not keep tests/processes alive.
  const timer=setInterval(()=>worker(),3000);timer.unref();
  async function estate(req){const id=String(req.query.estateId||'');if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new QueryError('Select a location.',400);if(!canAccess(req,id))throw new QueryError('Location access denied.',403);if(!await Estate.exists({_id:id}))throw new QueryError('Location not found.',404);return id;}
  async function find(req){const estateId=await estate(req);const job=await DocumentImport.findOne({_id:req.params.id,estateId}).lean();if(!job)throw new QueryError('Import not found.',404);return job;}
  api.post('/document-imports',async(req,res,next)=>{
    const estateId=await estate(req);await ready;
    if(await DocumentImport.countDocuments({status:{$in:['queued','extracting']}})>=20)throw new QueryError('The import queue is full. Try again after current files finish.',429);
    const disk=await fs.statfs(root);if(disk.bavail*disk.bsize<1024*1024*1024)throw new QueryError('Insufficient free storage for extraction.',507);
    if(uploads>=2)throw new QueryError('Two uploads are already receiving files. Try again shortly.',429);
    uploads++;
    upload(req,res,async error=>{try{
      if(error)throw new QueryError(error.message,400);
      if(!req.file)throw new QueryError('Choose a file.',400);
      const extension=path.extname(req.file.originalname).slice(1).toLowerCase();if(!documentExtensions.has(extension))throw new QueryError('Use PDF, images, XLSX, XLS, CSV or TSV. Use the map option for GeoJSON.',400);
      const surveyDate=String(req.body.surveyDate||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(surveyDate)||(!Number.isFinite(Date.parse(surveyDate))||new Date(surveyDate).toISOString().slice(0,10)!==surveyDate))throw new QueryError('Choose a valid source date.',400);
      const sha256=await fileHash(req.file.path),duplicate=await DocumentImport.findOne({estateId,sha256}).lean();if(duplicate)return res.json(duplicate);
      const id=randomUUID(),relative=`estates/${estateId}/documents/${id}`,folder=path.join(root,relative);await fs.mkdir(folder,{recursive:true,mode:0o700});
      const filePath=`${relative}/source.${extension}`;await fs.rename(req.file.path,path.join(root,filePath));await fs.chmod(path.join(root,filePath),0o600);
      const job=await DocumentImport.create({_id:id,estateId,title:String(req.body.title||req.file.originalname).slice(0,200),originalName:path.basename(req.file.originalname).slice(0,200),extension,filePath,sha256,bytes:req.file.size,surveyDate,status:'queued',uploadedBy:req.access.subject,uploadedAt:new Date().toISOString()});
      void worker();res.status(202).json(job);
    }catch(e){next(e);}finally{uploads--;if(req.file)await fs.unlink(req.file.path).catch(()=>{});}});
  });
  api.get('/document-imports',async(req,res)=>{const estateId=await estate(req),before=String(req.query.before||'');const filter={estateId,...(before?{_id:{$lt:before}}:{})};const jobs=await DocumentImport.find(filter).select('-filePath').sort({_id:-1}).limit(26).lean();res.json({items:jobs.slice(0,25),next:jobs.length>25?jobs[24]._id:null});});
  api.get('/document-imports/:id',async(req,res)=>{const job=await find(req);delete job.filePath;res.json(job);});
  api.get('/document-imports/:id/rows',async(req,res)=>{const job=await find(req),after=Number(req.query.after||0);if(!Number.isSafeInteger(after)||after<0)throw new QueryError('Invalid cursor.',400);const filter={estateId:job.estateId,importId:job._id,sequence:{$gt:after}};if(req.query.highlight==='true')filter.highlight=true;if(req.query.sheet)filter.sheet=String(req.query.sheet).slice(0,200);const rows=await DocumentRow.find(filter).sort({sequence:1}).limit(26).lean();res.json({items:rows.slice(0,25),next:rows.length>25?rows[24].sequence:null});});
  api.get('/document-imports/:id/file',async(req,res)=>{const job=await find(req);res.download(await secureStoredFile(root,job.filePath),job.originalName);});
  api.post('/document-imports/:id/retry',async(req,res)=>{const job=await find(req);if(job.status!=='failed')throw new QueryError('Only failed imports can be retried.',409);await DocumentImport.updateOne({_id:job._id,status:'failed'},{$set:{status:'queued',error:null}});void worker();res.json({status:'queued'});});
  api.post('/document-imports/:id/overlay',async(req,res)=>{
    const job=await find(req);
    if(!permitted(req.access,job.estateId,'map','add'))throw new QueryError('Map add permission is required.',403);
    if(!['pdf','png','jpg','jpeg','webp','tif','tiff'].includes(job.extension))throw new QueryError('Choose a PDF or image.',400);
    const bounds=req.body.bounds,page=Number(req.body.page||1);
    if(!Number.isInteger(page)||page<1||page>200||!Array.isArray(bounds)||bounds.length!==2||bounds.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))||bounds[0][0]>=bounds[1][0]||bounds[0][1]>=bounds[1][1]||bounds.some(p=>Math.abs(p[0])>90||Math.abs(p[1])>180))throw new QueryError('Provide valid whole-image WGS 84 bounds and page number.',400);
    if(working)throw new QueryError('Extraction is busy. Try the overlay after it finishes.',429);
    working=true;let saved;const output=path.join(staging,randomUUID()+'.png');
    try{
      await ready;
      await runExtraction(await secureStoredFile(root,job.filePath),output,job.extension,undefined,['render',String(page)]);
      saved=await ingestImage(root,output,job.estateId);
      const asset=await models.Asset.create({_id:saved.id,estateId:job.estateId,name:`${job.title} · page ${page}`,kind:'imagery',acquiredAt:job.surveyDate,importedAt:new Date().toISOString(),bounds,file:saved.file,attribution:`Uploaded source: ${job.originalName}; page ${page}; bounds supplied by user`});
      res.json({id:asset._id});
    }catch(error){if(saved)await fs.unlink(path.join(root,saved.file.path)).catch(()=>{});throw error;}
    finally{working=false;await fs.unlink(output).catch(()=>{});}
  });
  api.post('/document-imports/:id/geospatial',async(req,res)=>{
    const job=await find(req);
    if(!permitted(req.access,job.estateId,'geospatial','add'))throw new QueryError('Geospatial Analysis add permission is required.',403);
    const reportId=`document-${job._id}`;
    if(await models.GeospatialReport.exists({_id:reportId,estateId:job.estateId}))return res.json({reportId});
    const sheet=String(req.body.sheet||''),mapping=req.body.mapping||{},skip=Number(req.body.skip||1);
    if(!Number.isInteger(skip)||skip<0||skip>1000)throw new QueryError('Invalid header row count.',400);
    const allowed=['sourceBlockCode','plantingYear','surveyAreaHa','totalPalms','palmsPerHectare','densityCategory','cohort'];
    for(const [k,v] of Object.entries(mapping))if(!allowed.includes(k)||!Number.isInteger(v)||v<0||v>199)throw new QueryError('Invalid column mapping.',400);
    if(sheet&&(!job.sheets.includes(sheet)||mapping.sourceBlockCode===undefined))throw new QueryError('Choose a worksheet/table and block-code column.',400);
    const lock=await DocumentImport.findOneAndUpdate({_id:job._id,status:{$in:['review','applied']}},{$set:{status:'publishing',leaseUntil:new Date(Date.now()+600000)}},{new:true});
    if(!lock)throw new QueryError('Extraction or publication is already in progress.',409);
    try{
      await models.GeospatialRow.deleteMany({estateId:job.estateId,reportId});
      const blocks=await models.Block.find({estateId:job.estateId}).select('blockCode mapBlockNames plantedHectares').lean();
      const candidates=new Map();for(const b of blocks)for(const code of new Set([b.blockCode,...(b.mapBlockNames||[])])){const key=String(code).trim().toUpperCase();candidates.set(key,[...(candidates.get(key)||[]),b]);}
      let batch=[],count=0;
      if(sheet)for await(const row of DocumentRow.find({estateId:job.estateId,importId:job._id,sheet,kind:'table',sourceRow:{$gt:skip}}).sort({sequence:1}).lean().cursor()){
        const fields={};const issues=['Source extraction and column mapping require verification.'];
        for(const [key,col] of Object.entries(mapping)){
          const raw=(row.cells[col]||'').trim();
          if(['surveyAreaHa','totalPalms','palmsPerHectare'].includes(key)){
            const clean=raw.replace(/,/g,'');
            if(raw&&(!/^\d+(\.\d+)?$/.test(clean)||!Number.isFinite(Number(clean))||(key==='totalPalms'&&!Number.isSafeInteger(Number(clean)))))issues.push(`Invalid ${key}: ${raw}`);
            else fields[key]=raw?Number(clean):null;
          }else fields[key]=raw.slice(0,200);
        }
        if(!fields.sourceBlockCode){issues.push('Missing block reference.');fields.sourceBlockCode=`Source row ${row.sourceRow}`;}
        const matches=candidates.get(fields.sourceBlockCode.toUpperCase())||[],match=matches.length===1?matches[0]:null;
        if(!match)issues.push(matches.length?'Ambiguous block reference.':'Block reference not found in this location.');
        const delta=fields.surveyAreaHa!=null&&match?.plantedHectares!=null?fields.surveyAreaHa-match.plantedHectares:null;
        if(delta!=null&&Math.abs(delta)>.01)issues.push('Survey area differs from the current block register.');
        batch.push({_id:`${reportId}-${row.sequence}`,estateId:job.estateId,reportId,sourceRow:++count,...fields,mapBlockCode:match?.blockCode||null,mapMatch:match?'Exact reference':'Unmatched',currentAreaHa:match?.plantedHectares,areaDifferenceHa:delta,highlight:true,issues,sourcePages:row.sheet.startsWith('Page ')?[Number(row.sheet.match(/Page (\d+)/)?.[1])]:[]});
        if(batch.length===250){await models.GeospatialRow.insertMany(batch);batch=[];}
      }
      if(batch.length)await models.GeospatialRow.insertMany(batch);
      const text=await DocumentRow.find({estateId:job.estateId,importId:job._id,kind:'text'}).sort({sequence:1}).limit(20).lean();
      const findings=text.map(r=>({title:`Source extract · ${r.sheet}`,text:r.cells.join(' ').slice(0,2000),pages:r.sheet.startsWith('Page ')?[r.sourceRow]:[]}));
      const due=new Date(job.surveyDate+'T00:00:00Z');due.setUTCFullYear(due.getUTCFullYear()+1);
      await models.GeospatialReport.create({_id:reportId,estateId:job.estateId,title:job.title,surveyDate:job.surveyDate,reportDate:job.surveyDate,importedAt:job.uploadedAt,nextSurveyDue:due.toISOString().slice(0,10),cadenceMonths:12,sourceFile:job.originalName,sourceFiles:[job.originalName],summary:{},findings,issues:[...job.warnings,'Source date was supplied by the uploader. Extracts are source text, not independently verified recommendations.','No geographic coordinates or boundary polygons were inferred. Table references link only to exact, unambiguous existing blocks.'],files:[{key:'report.pdf',path:job.filePath,mime:job.extension==='pdf'?'application/pdf':'application/octet-stream'}],layers:[]});
      await DocumentImport.updateOne({_id:job._id},{$set:{status:'applied',appliedAt:new Date().toISOString(),appliedBy:req.access.subject},$unset:{leaseUntil:1}});
      res.json({reportId,rows:count});
    }catch(error){await DocumentImport.updateOne({_id:job._id},{$set:{status:'review'},$unset:{leaseUntil:1}});throw error;}
  });
  api.post('/document-imports/:id/apply',async(req,res)=>{
    const job=await find(req);if(!['review','applied'].includes(job.status))throw new QueryError('Wait for extraction to finish.',409);
    // Publication retains source structure, including unknown fields, rather than
    // silently assigning financial units or replacing an existing block master.
    await DocumentImport.updateOne({_id:job._id,status:'review'},{$set:{status:'applied',appliedAt:new Date().toISOString(),appliedBy:req.access.subject}});
    res.json({status:'applied'});
  });
}
