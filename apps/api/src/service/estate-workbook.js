import {refreshTrialReport} from './record-totals.js';
import ExcelJS from 'exceljs';
import multer from 'multer';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {workbookSheets} from './estate-workbook-schema.js';
import {canAccess,requireWrite} from './auth.js';
import {permitted,dataMenus} from '../../../../packages/shared/access.js';
import {currencyCodes} from '../../../../packages/shared/currency.js';
import {QueryError,invalidateSummaries} from './performance.js';
import {nameInput} from './production.js';
import {wageInput} from './wages.js';

const VERSION='mapintel-estate-1';
const SOURCE='estate-excel';
const TTL=15*60*1000;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity=(model,estateId,keys)=>'xl-'+hash([model,estateId,keys]).slice(0,40);
const allowed=(access,estateId,menu,action='view')=>!access.managed ? (action==='view'||['admin','manager'].includes(access.role)) : permitted(access,estateId,menu,action);
const fail=message=>{throw new QueryError(message,400);};
const cleanOld=doc=>{if(!doc)return null;const {history,...rest}=doc;return rest;};
const readQuery=q=>q.lean();
function scalar(cell){
 const v=cell.value;
 if(v==null)return '';
 if(v instanceof Date)return v.toISOString().slice(0,10);
 if(typeof v==='object')fail('Use plain values, not formulas, hyperlinks or rich text.');
 return typeof v==='string'?v.trim():v;
}
export function parseValue(value,col){
 if(value===''||value==null){if(col.required)fail(`${col.label} is required`);return undefined;}
 const s=String(value).trim();
 if(s.length>4000)fail(`${col.label} is too long`);
 if(col.type==='text')return s;
 if(col.type==='boolean'){if(['true','yes','1'].includes(s.toLowerCase()))return true;if(['false','no','0'].includes(s.toLowerCase()))return false;fail(`${col.label} must be TRUE or FALSE`);}
 if(col.type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail(`${col.label} must be a valid YYYY-MM-DD date`);return s;}
 if(col.type==='month'){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))fail(`${col.label} must be YYYY-MM`);return s;}
 if(col.type==='currency'){if(!currencyCodes.includes(s))fail('Use a supported uppercase currency code');return s;}
 if(col.type.includes('|')){if(!col.type.split('|').includes(s))fail(`${col.label}: choose ${col.type}`);return s;}
 if(!/^-?(\d+\.?\d*|\.\d+)$/.test(s))fail(`${col.label} must be a number without commas or currency symbols`);
 const n=Number(s);
 if(!Number.isFinite(n)||Math.abs(n)>1e13)fail(`${col.label} is outside the supported range`);
 if(!['signed','minor'].includes(col.type)&&n<0)fail(`${col.label} cannot be negative`);
 if(['integer','minor','minorPositive','year'].includes(col.type)&&!Number.isSafeInteger(n))fail(`${col.label} must be a whole number`);
 if(col.type==='year'&&(n<1900||n>2200))fail('Year must be between 1900 and 2200');
 return n;
}
// Reject oversized archives before ExcelJS inflates XML. XLSX macros are not accepted.
export function checkArchive(buffer){
 if(buffer.length>5*1024*1024)fail('Maximum workbook size is 5 MB');
 let e=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){e=i;break;}
 if(e<0)fail('Upload an .xlsx workbook');
 let p=buffer.readUInt32LE(e+16),size=0;const count=buffer.readUInt16LE(e+10);
 if(count>500||count===0||buffer.readUInt16LE(e+4)!==0)fail('Unsupported workbook archive');
 for(let i=0;i<count;i++){
  if(p+46>buffer.length||buffer.readUInt32LE(p)!==0x02014b50)fail('Invalid workbook archive');
  size+=buffer.readUInt32LE(p+24);
  const len=buffer.readUInt16LE(p+28),extra=buffer.readUInt16LE(p+30),comment=buffer.readUInt16LE(p+32);
  const name=buffer.subarray(p+46,p+46+len).toString();
  if(size>40*1024*1024||/vbaProject|externalLinks/i.test(name))fail('Workbook is too large or contains unsupported macros/external links');
  p+=46+len+extra+comment;
 }
}
function referenceStamp(ctx){return hash({currency:ctx.estate.currency,boundary:ctx.estate.boundary,blocks:ctx.blocks.map(b=>[b._id,b.blockCode]),names:ctx.names.map(n=>[n._id,n.sourceBlockCode,n.division,n.mapBlockCode]),vehicles:ctx.vehicles.map(v=>[v._id,v.sourceIdentifier])});}
async function context(models,estateId){
 const [estate,blocks,names,vehicles]=await Promise.all([
  readQuery(models.Estate.findOne({_id:estateId})),
  readQuery(models.Block.find({estateId}).sort({_id:1}).limit(10001)),
  readQuery(models.ProductionName.find({estateId}).sort({_id:1}).limit(10001)),
  readQuery(models.Vehicle.find({estateId}).sort({_id:1}).limit(10001)),
 ]);
 if(!estate)throw new QueryError('Estate not found',404);
 if([blocks,names,vehicles].some(r=>r.length>10000))fail('Estate reference list exceeds the supported limit');
 return {estate,blocks,names,vehicles,mapCodes:new Set((estate.boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No).filter(Boolean))};
}
export async function createEstateTemplate(models,estateId,access){
 const ctx=await context(models,estateId),book=new ExcelJS.Workbook();
 book.creator='MapIntel';book.created=new Date();
 const instruction=book.addWorksheet('Instructions');
 const notes=[['MapIntel estate data template',ctx.estate.name],['Estate ID',estateId],['Version',VERSION],
 ['1. Fill your data','Each data tab has exactly two SAMPLE rows. Replace values and change Row type to DATA for rows you want to upload. Delete unused rows or leave SAMPLE.'],
 ['2. Keep identity stable','Keep sheet names and column headers. Record key identifies one source line: reuse it for corrections, use a new key for a new record. Optional Record ID updates an existing record only within this estate and the same natural identity.'],
 ['3. Review upload','Upload to the same selected estate. Preview shows additions, updates and errors. Nothing is saved until Apply updates. Samples are always skipped.'],
 ['4. Dates and blanks','Use YYYY-MM-DD dates and YYYY-MM months. Blank optional cells keep existing values; blanks do not erase data. Enter 0 only when the value is truly zero. Formulas are not accepted.'],
 ['5. Amounts','Financial columns explicitly use minor currency units (e.g. 10000 = 100.00). Currency must match estate setup. Derived totals, geometry and verification are not editable here.'],
 ['6. References','Estate references lists block and source identities for this estate. Source block + division identifies a production name. Create missing names on Block-name history first.'],
 ['7. Limits','Maximum 1,000 DATA rows and 5 MB per upload. Preview expires after 15 minutes. Save the workbook for later updates.'],
 ['8. Scope','Vehicle sheets cover identity and usage. Detailed vehicle expenses and detailed trial-balance statements use their existing import process. Imported data is a general reference table, not a typed financial import.']];
 for(const s of workbookSheets.filter(s=>allowed(access,estateId,s.menu)))notes.push([s.name,s.note]);
 instruction.addRows(notes);instruction.columns=[{width:30},{width:110}];instruction.eachRow(r=>{r.alignment={wrapText:true,vertical:'top'};r.height=45;});
 const meta=book.addWorksheet('_MapIntel');meta.addRows([['Version',VERSION],['Estate ID',estateId],['Estate',ctx.estate.name]]);meta.state='veryHidden';
 for(const def of workbookSheets.filter(s=>allowed(access,estateId,s.menu))){
  const sheet=book.addWorksheet(def.name,{views:[{state:'frozen',ySplit:1}]});
  const cols=[{key:'rowType',label:'Row type'},{key:'recordId',label:'Record ID (optional)'},...def.columns];
  sheet.columns=cols.map(c=>({header:c.label,key:c.key,width:Math.min(40,Math.max(20,c.label.length+3))}));
  sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:cols.length}};
  for(let i=0;i<2;i++){
   const b=ctx.blocks[i%Math.max(1,ctx.blocks.length)],n=ctx.names[i%Math.max(1,ctx.names.length)];
   const refs={'@block':b?.blockCode||`EXAMPLE-${i+1}`,'@source':n?.sourceBlockCode||b?.blockCode||`EXAMPLE-${i+1}`,'@division':n?.division??b?.division??'Division 1','@map':n?.mapBlockCode||[...ctx.mapCodes][i]||[...ctx.mapCodes][0]||`EXAMPLE-${i+1}`,'@currency':ctx.estate.currency||'USD','@estate':ctx.estate.name};
   const row={rowType:'SAMPLE',recordId:''};
   for(const c of def.columns){let v=refs[c.sample]??c.sample;if(c.key==='sourceKey')v=`example-${i+1}`;if(c.key==='sourceIdentifier')v=`TRACTOR-00${i+1}`;if(c.key==='sourceSequence')v=i+1;if(def.model==='TrialBalanceSummary'&&c.key==='accountCode')v=String(50000+i);row[c.key]=v;}
   sheet.addRow(row);
  }
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF194D38'}};sheet.getRow(1).height=30;
  for(let r=2;r<=3;r++){sheet.getRow(r).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF3CE'}};sheet.getCell(r,1).dataValidation={type:'list',allowBlank:false,formulae:['"SAMPLE,DATA"']};}
  def.columns.forEach((c,i)=>{sheet.getCell(1,i+3).note=`${c.required?'Required. ':''}${c.type}. ${def.note}`;if(['text','date','month'].includes(c.type))sheet.getColumn(i+3).numFmt='@';});
 }
 const refs=book.addWorksheet('Estate references');refs.addRow(['Type','Code / identifier','Division','Map block']);
 if(allowed(access,estateId,'blocks'))for(const b of ctx.blocks)refs.addRow(['Block',b.blockCode,b.division||'',(b.mapBlockNames||[]).join(', ')]);
 if(allowed(access,estateId,'names'))for(const n of ctx.names)refs.addRow(['Source block',n.sourceBlockCode,n.division||'',n.mapBlockCode||'']);
 if(allowed(access,estateId,'vehicles'))for(const v of ctx.vehicles)refs.addRow(['Vehicle',v.sourceIdentifier||'',v.name,'']);
 refs.columns.forEach(c=>c.width=30);refs.views=[{state:'frozen',ySplit:1}];
 return {buffer:Buffer.from(await book.xlsx.writeBuffer()),name:`${ctx.estate.name.replace(/[^a-zA-Z0-9_-]/g,'-')}-data-template.xlsx`};
}

export async function previewEstateWorkbook(models,estateId,access,buffer){
 checkArchive(buffer);const book=new ExcelJS.Workbook();
 try{await book.xlsx.load(buffer);}catch{fail('Cannot read this workbook. Download a fresh .xlsx template.');}
 const meta=book.getWorksheet('_MapIntel');
 if(!meta||meta.getCell('B1').value!==VERSION)fail('Use the current MapIntel estate template');
 if(meta.getCell('B2').value!==estateId)fail('This workbook belongs to a different estate. Select its estate or download a new template.');
 const ctx=await context(models,estateId),references=referenceStamp(ctx),entries=[],errors=[],operations=new Map();let samples=0,rows=0;
 const err=(sheet,row,message)=>errors.push({sheet,row,message});
 for(const sheet of book.worksheets){
  if(['Instructions','_MapIntel','Estate references'].includes(sheet.name))continue;
  const def=workbookSheets.find(s=>s.name===sheet.name);
  if(!def){err(sheet.name,1,'Unknown worksheet. Keep the original template sheet names.');continue;}
  const headers=['Row type','Record ID (optional)',...def.columns.map(c=>c.label)];
  if(sheet.columnCount>headers.length||headers.some((h,i)=>sheet.getCell(1,i+1).value!==h)){err(sheet.name,1,'Column headers do not match the template');continue;}
  if(sheet.rowCount>10003){err(sheet.name,1,'Too many worksheet rows; remove unused formatted rows');continue;}
  for(let r=2;r<=sheet.rowCount;r++){
   try{
    const values=headers.map((_,i)=>scalar(sheet.getCell(r,i+1)));
    if(values.every(v=>v===''))continue;
    if(values[0]==='SAMPLE'){samples++;continue;}
    if(values[0]!=='DATA')fail('Row type must be DATA or SAMPLE');
    if(++rows>1000)fail('Maximum 1,000 DATA rows per upload');
    if(!allowed(access,estateId,def.menu))fail('No permission for this table');
    const record={};def.columns.forEach((c,i)=>{const v=parseValue(values[i+2],c);if(v!==undefined)record[c.key]=v;});
    entries.push({def,row:r,record,recordId:String(values[1]||'')});
   }catch(e){err(sheet.name,r,e.message);}
   if(rows>1000)break;
  }
 }
 if(rows>1000)return {estateName:ctx.estate.name,operations:[],errors,samples,summary:[]};
 // Process identities before dependent records regardless of tab order.
 entries.sort((a,b)=>workbookSheets.indexOf(a.def)-workbookSheets.indexOf(b.def));
 const seen=new Set();
 for(const entry of entries){
  const {def,row,recordId}=entry;const r={...entry.record,estateId};
  try{
   if(def.keys.includes('sourceSystem')||def.event)r.sourceSystem=SOURCE;
   if(def.source){
    const names=ctx.names.filter(n=>n.sourceBlockCode===r.sourceBlockCode&&(n.division||'')===(r.division||''));
    if(names.length!==1)fail('Source block + division must identify one name in this estate (or Block-name history)');
    r.sourceBlockId=names[0]._id;delete r.sourceBlockCode;delete r.division;
   }
   if(def.model==='ProductionName'){r.division??='';r.mapBlockCode??=null;}
   if(r.mapBlockCode&&!ctx.mapCodes.has(r.mapBlockCode))fail('Map block is not a current polygon in this estate');
   if(r.currency&&r.currency!==ctx.estate.currency)fail('Currency must match the currency configured for this estate');
   if(def.model==='YearlyProduction'&&!r.month.startsWith(String(r.year)+'-'))fail('Month must be in the stated year');
   if(def.model==='Wage'){r.basis='monthly';const {estateId:ignored,...input}=r;wageInput.parse(input);}
   if(def.model==='Vehicle'){r.sourceLabel=r.name;r.identityStatus='source_identifier';}
   if(def.model==='VehicleUsage'){
    const matches=ctx.vehicles.filter(v=>v.sourceIdentifier===r.sourceIdentifier);
    if(matches.length!==1)fail('Vehicle identifier must identify one vehicle in this estate or Vehicles sheet');
    r.vehicleId=matches[0]._id;delete r.sourceIdentifier;
    if(r.runningHours==null&&r.distanceKm==null)fail('Supply running hours or distance');
   }
   if(r.blockCode&&def.model!=='Block'){
    const b=ctx.blocks.find(b=>b.blockCode===r.blockCode);if(!b)fail('Block does not exist in this estate');
    if(def.event){r.blockId=b._id;r.status='recorded';}
   }
   if(def.event)r._id=identity(def.model,estateId,[r.sourceKey]);
   if(def.generic){r._id=identity(def.model,estateId,[r.sourceKey]);r.importId=identity('DocumentImport',estateId,['estate-excel']);r.cells=Array.from({length:6},(_,i)=>r['cell'+i]||'');for(let i=0;i<6;i++)delete r['cell'+i];delete r.sourceKey;r.kind='data';r.sourceRow=row;r.sequence=parseInt(hash(r._id).slice(0,10),16);}
   if(def.model==='TrialBalanceSummary'){if(!/^\d{5}$/.test(r.accountCode))fail('Trial-balance account code must contain five digits');if(!(r.sourceSequence>0))fail('Account order must be positive');r.accountKey=r.accountCode;}
   if(r.date)r.month=r.date.slice(0,7);
   if(def.model==='StockIssue'){r.productId=r.productCode;}
   const where={estateId,...Object.fromEntries(def.keys.map(k=>[k,r[k]]))};
   const opKey=JSON.stringify([def.model,where]);const rowKey=def.name+opKey;
   if(seen.has(rowKey))fail('Duplicate identity within this worksheet');seen.add(rowKey);
   let existing=operations.get(opKey);
   let old=existing?.old||await readQuery(models[def.model].findOne(where));
   if(recordId){
    const byId=await readQuery(models[def.model].findOne({_id:recordId,estateId}));
    if(!byId)fail('Record ID does not exist in the selected estate');
    if(old&&old._id!==byId._id)fail('Record ID conflicts with this row identity');
    // Source keys are scoped to this template; explicit IDs may update older sources.
    for(const k of def.keys.filter(k=>!['sourceSystem','sourceKey','_id'].includes(k)))if(byId[k]!==r[k])fail(`Cannot change identity field ${k} on an existing record`);
    old=byId;r._id=byId._id;if(byId.sourceSystem)r.sourceSystem=byId.sourceSystem;if(byId.sourceKey)r.sourceKey=byId.sourceKey;
   }
   if(def.parameters&&!old&&!existing)fail('Monthly parameters require an existing record or a matching Monthly production row');
   if(def.parameters)for(const k of Object.keys(r))if(existing&&k!=='estateId'&&existing.record[k]!==undefined&&existing.record[k]!==r[k])fail(`Conflicting ${k} between monthly production and parameters`);
   if(old?.verifiedAt||old?.status==='verified')fail('Verified activities must be reviewed in the activity screen before editing');
   if(def.model==='TrialBalanceSummary'){
    if(old&&(Number(old.detailRowCount)>0||await models.TrialBalanceDetail.exists({estateId,year:r.year,accountKey:r.accountKey})))fail('This account has detailed transactions; use the detailed statement import');
    Object.assign(r,{hierarchyPath:old?.hierarchyPath||[r.accountName],hierarchy:old?.hierarchy||[{label:r.accountName}],beigeDetailCount:old?.beigeDetailCount||0,blockReviewDetailCount:old?.blockReviewDetailCount||0,netMinor:r.debitMinor-r.creditMinor,importState:'complete',detailsStatus:'unavailable',detailRowCount:0,transactionCount:0,detailNetMinor:null,reconciliationDifferenceMinor:null,sourceSystem:SOURCE});
   }
   if(def.model==='StockIssue'&&(!old||['unit','netQuantity','productCode'].some(k=>old[k]!==r[k]))){Object.assign(r,{normalizationStatus:'unresolved',normalizedQuantity:null,normalizedUnit:null,conversionFactor:null,conversionBasis:null});}
   const action=old?'edit':'add';if(!allowed(access,estateId,def.menu,action))fail(`No permission to ${action==='edit'?'update':'add'} this table`);
   const record={...existing?.record,...r};record._id=old?._id||record._id||identity(def.model,estateId,def.keys.map(k=>r[k]));
   if([...operations.values()].some(o=>o.record._id===record._id&&o.model===def.model&&o!==existing))fail('Duplicate target record in this workbook');
   const merged={...old,...record};
   if(['MonthlyProduction','YearlyProduction'].includes(def.model)){
    if(!merged.receiptStatus)fail('Receipt status is required');
    if(merged.receiptStatus==='not_received'&&[merged.mt,merged.looseFruitMt,merged.bunches].some(n=>n!=null&&n!==0))fail('Not received records cannot have positive production');
   }
   if(def.model==='ProductionName'){const n={...merged};nameInput.parse({sourceBlockCode:n.sourceBlockCode,division:n.division,mapBlockCode:n.mapBlockCode,linkMethod:n.linkMethod,firstMonth:n.firstMonth,lastMonth:n.lastMonth,note:n.note||''});}
   // Validate the complete merged document against the application's persisted schema.
   await new models[def.model](merged).validate();
   const unchanged=old&&Object.entries(record).every(([k,v])=>JSON.stringify(old[k])===JSON.stringify(v));
   const op={def:workbookSheets.indexOf(def),model:def.model,where:old?{_id:old._id,estateId}:where,old:cleanOld(old),record,rows:[...(existing?.rows||[]),{sheet:def.name,row}],menus:[...new Set([...(existing?.menus||[]),def.menu])],action:unchanged?'unchanged':old?'update':'add'};
   operations.set(opKey,op);
   if(def.model==='ProductionName'&&!old)ctx.names.push(record);
   if(def.model==='Vehicle'&&!old)ctx.vehicles.push(record);
   if(def.model==='Block'&&!old)ctx.blocks.push(record);
  }catch(e){err(def.name,row,e.issues?e.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '):e.message);}
 }
 const ops=[...operations.values()],summary=workbookSheets.map(s=>({sheet:s.name,add:ops.filter(o=>o.rows.some(r=>r.sheet===s.name)&&o.action==='add').length,update:ops.filter(o=>o.rows.some(r=>r.sheet===s.name)&&o.action==='update').length,unchanged:ops.filter(o=>o.rows.some(r=>r.sheet===s.name)&&o.action==='unchanged').length})).filter(s=>s.add+s.update+s.unchanged);
 return {estateName:ctx.estate.name,references,operations:ops,errors,samples,summary};
}

export function installEstateWorkbook(api,models,config){
 const previews=new Map(),locks=new Set();
 const scope=async req=>{const id=String(req.query.estateId||req.body?.estateId||'');if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))fail('Select one estate');if(!canAccess(req,id))throw new QueryError('Estate access denied',403);return id;};
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:1}}).single('workbook');
 api.get('/estate-workbook/template',async(req,res)=>{
  const estateId=await scope(req);if(!dataMenus.some(m=>allowed(req.access,estateId,m)))throw new QueryError('No data access',403);
  const result=await createEstateTemplate(models,estateId,req.access);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(result.name).send(result.buffer);
 });
 api.post('/estate-workbook/preview',requireWrite,upload,async(req,res)=>{
  const estateId=await scope(req);if(!allowed(req.access,estateId,'imports','add'))throw new QueryError('Import permission is required',403);
  if(!req.file||!req.file.originalname.toLowerCase().endsWith('.xlsx'))fail('Choose an .xlsx workbook');
  for(const [k,v]of previews)if(v.expires<Date.now())previews.delete(k);
  if(previews.size>=20)throw new QueryError('Too many pending uploads. Try again after previews expire.',429);
  const {operations,references,...result}=await previewEstateWorkbook(models,estateId,req.access,req.file.buffer);
  const token=randomUUID();if(!result.errors.length)previews.set(token,{estateId,subject:req.access.subject,expires:Date.now()+TTL,references,operations,sha256:hash(req.file.buffer),filename:path.basename(req.file.originalname),workbook:req.file.buffer.toString('base64')});
  res.json({...result,token:result.errors.length?null:token,changes:operations.filter(o=>o.action!=='unchanged').length,expiresInMinutes:15});
 });
 api.post('/estate-workbook/apply',requireWrite,async(req,res)=>{
  const estateId=await scope(req),p=previews.get(req.body.token);
  if(!p||p.estateId!==estateId||p.subject!==req.access.subject||p.expires<Date.now())throw new QueryError('Preview expired. Upload the workbook again.',409);
  if(!allowed(req.access,estateId,'imports','add'))throw new QueryError('Import permission is required',403);
  if(locks.has(estateId))throw new QueryError('Another workbook is being saved for this estate. Try again shortly.',409);
  locks.add(estateId);let saved=0;
  try{
   const changes=p.operations.filter(o=>o.action!=='unchanged');
   if(p.references!==referenceStamp(await context(models,estateId)))throw new QueryError('Estate references changed since preview. Upload again.',409);
   for(const op of changes){
    if(op.menus.some(m=>!allowed(req.access,estateId,m,op.old?'edit':'add')))throw new QueryError('Your permissions have changed. Upload again.',403);
    const now=cleanOld(await readQuery(models[op.model].findOne(op.where)));
    if(hash(now)!==hash(op.old))throw new QueryError('Records changed since preview. Upload again to review current values.',409);
   }
   // Keep a private server-side recovery journal before the first database write.
   const folder=path.join(config.dataDir,'estates',estateId,'workbook-imports');await fs.mkdir(folder,{recursive:true,mode:0o700});
   const journal=path.join(folder,`${req.body.token}.json`);
   const workbookPath=path.join(folder,`${req.body.token}.xlsx`);
   await fs.writeFile(workbookPath,Buffer.from(p.workbook,'base64'),{flag:'wx',mode:0o600});
   delete p.workbook;
   await fs.writeFile(journal,JSON.stringify({...p,at:new Date(),status:'applying'}),{flag:'wx',mode:0o600});
   previews.delete(req.body.token);
   try{
    for(const op of changes){
     const Model=models[op.model],record={...op.record};delete record._id;
     if(Model.schema.path('updatedBy'))record.updatedBy=req.access.subject;
     if(op.old){
      const where={...op.where,...(op.old.updatedAt?{updatedAt:op.old.updatedAt}:{}),...(op.old.revision!=null?{revision:op.old.revision}:{})};
      const update={$set:record};if(Model.schema.path('revision'))update.$inc={revision:1};
      if(Model.schema.path('history'))update.$push={history:{at:new Date(),by:req.access.subject,previous:op.old}};
      const result=await Model.updateOne(where,update,{runValidators:true});if(result.matchedCount!==1)throw Error('A record changed while saving');
     }else await Model.create({...record,_id:op.record._id});
     saved++;
     invalidateSummaries();
    }
    if(p.operations.some(o=>o.model==='DocumentRow')){
     const importId=identity('DocumentImport',estateId,['estate-excel']);
     const count=await models.DocumentRow.countDocuments({estateId,importId});
     await models.DocumentImport.updateOne({_id:importId,estateId},{$set:{title:'Estate Excel reference data',originalName:p.filename,extension:'xlsx',filePath:path.relative(config.dataDir,workbookPath),surveyDate:new Date().toISOString().slice(0,10),status:'applied',rowCount:count,sheets:await models.DocumentRow.distinct('sheet',{estateId,importId}),appliedBy:req.access.subject,appliedAt:new Date().toISOString()},$setOnInsert:{sha256:hash([estateId,SOURCE]),uploadedBy:req.access.subject,uploadedAt:new Date().toISOString()}},{upsert:true});
    }
    for(const year of new Set(changes.filter(o=>o.model==='TrialBalanceSummary').map(o=>o.record.year)))await refreshTrialReport(models,estateId,year);
    invalidateSummaries();
    await fs.writeFile(journal,JSON.stringify({...p,at:new Date(),status:'complete',saved}),{mode:0o600});
    res.json({saved,complete:true});
   }catch(error){
    await fs.writeFile(journal,JSON.stringify({...p,at:new Date(),status:'partial',saved,error:error.message}),{mode:0o600});
    res.status(409).json({error:`Saved ${saved} of ${changes.length} records before an error. Upload again to review remaining changes.`,saved,complete:false});
   }
  }finally{locks.delete(estateId);}
 });
}
