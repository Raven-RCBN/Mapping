import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const OBAN_TB_ESTATE_ID='f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae';
export const TB_COLLECTIONS={summary:'mappingtrialbalancesummaries',details:'mappingtrialbalancedetails'};
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const minor=value=>value==null?null:Math.round(value*100);
export const clean=value=>value==null||value===''||value==='-'?null:value;
export function blockSnapshot(blocks,boundary){
 return {blocks:blocks.map(b=>({_id:b._id,estateId:b.estateId,blockCode:b.blockCode,mapBlockNames:b.mapBlockNames||[]})).sort((a,b)=>a._id.localeCompare(b._id)),boundaryHash:hash(boundary)};
}
const norm=s=>s.toUpperCase().replace(/\s+/g,'').replace(/^([A-N])0+(\d)/,'$1$2');
// Parse only isolated source block fields, never item numbers, employee IDs or rates.
export function parseBlocks(raw){
 if(!raw)return {tokens:[],unparsed:null};
 let s=raw.toUpperCase().trim().replace(/\bBLOCKS?\s*(?=[A-N]\d)/g,'');
 const tokens=[];
 s=s.replace(/\b([A-N])(\d+)\s*(?:-|TO)\s*([A-N])?(\d+)\b/g,(full,a,start,b,end)=>{
  if(b&&a!==b||+end<+start||+end-+start>100)return full;
  for(let n=+start;n<=+end;n++)tokens.push(a+n);
  return ';';
 });
 s=s.replace(/\b([A-N])(\d+)\s*\/\s*(\d+)\b/g,(_,a,b,c)=>`${a}${b};${a}${c}`);
 s=s.replace(/\bAND\b|&|\//g,';');
 const bad=[];
 for(const part of s.split(/[;,]/).map(x=>x.trim()).filter(Boolean)){
  if(/^[A-N]-?\d+[AB]?$/.test(part)||/^ESP(?:\s*\d+)?$/.test(part))tokens.push(part);
  else bad.push(part);
 }
 return {tokens:[...new Set(tokens)],unparsed:bad.length?bad.join('; '):null};
}
export function resolveBlocks(raw,blocks,boundary,{building=false}={}){
 blocks=blocks.filter(b=>b.estateId===OBAN_TB_ESTATE_ID);
 if(!raw)return {raw:null,status:'not_provided',references:[],unparsed:null};
 if(building)return {raw,status:'non_plantation_reference',references:[],unparsed:raw};
 const parsed=parseBlocks(raw),features=new Set((boundary?.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)&&f.geometry.coordinates?.length).map(f=>f.properties?.blockName));
 const references=parsed.tokens.map(token=>{
  const exact=blocks.filter(b=>b.blockCode.toUpperCase()===token.toUpperCase());
  const matches=exact.length?exact:blocks.filter(b=>norm(b.blockCode)===norm(token)||(b.mapBlockNames||[]).some(n=>norm(n)===norm(token)));
  if(matches.length===1){const b=matches[0],mapped=(b.mapBlockNames||[]).filter(n=>features.has(n));
   return {sourceReference:token,blockId:b._id,blockCode:b.blockCode,status:mapped.length?'matched':'master_without_map',method:exact.length?'exact':'unique_normalized',mapBlockNames:mapped,candidates:[]};}
  const candidates=matches.length?matches:blocks.filter(b=>b.blockCode.split('+').some(part=>new RegExp(`^${norm(token)}[AB]?$`).test(norm(part))));
  return {sourceReference:token,blockId:null,blockCode:null,status:candidates.length?'ambiguous':'missing',method:null,mapBlockNames:[],candidates:candidates.map(b=>({blockId:b._id,blockCode:b.blockCode}))};
 });
 return {raw,status:parsed.unparsed?'ambiguous':references.every(r=>r.status==='matched')?'matched':references.some(r=>r.status==='matched')?'partial':'unresolved',references,unparsed:parsed.unparsed};
}
export function validateDataset(data){
 assert.equal(data.estateId,OBAN_TB_ESTATE_ID);assert.equal(data.year,2025);assert.equal(data.currency,'NGN');
 assert.equal(data.summary.length,185);assert.equal(data.details.length,18085);
 const ids=new Set(),accounts=new Map();
 for(const s of data.summary){assert.equal(s.estateId,data.estateId);assert.equal(s.year,data.year);assert(!ids.has(s._id));ids.add(s._id);accounts.set(s.accountKey,s);for(const k of ['debitMinor','creditMinor','netMinor'])assert(Number.isSafeInteger(s[k]));assert.equal(s.netMinor,s.debitMinor-s.creditMinor);assert.deepEqual(s.hierarchy.map(n=>n.label),s.hierarchyPath);assert.equal(s.hierarchy.length,s.hierarchyPath.length);}
 assert.equal(data.summary.reduce((n,s)=>n+s.debitMinor,0),3953570252124);
 assert.equal(data.summary.reduce((n,s)=>n+s.creditMinor,0),3953570252128);
 const groups=new Map();
 for(const r of data.details){assert(!ids.has(r._id));ids.add(r._id);assert.equal(r.estateId,data.estateId);assert.equal(r.year,data.year);assert.equal(r.summaryId,accounts.get(r.accountKey)?._id);assert.match(r.date,/^2025-\d{2}-\d{2}$/);assert.equal(new Date(r.date).toISOString().slice(0,10),r.date);
  for(const k of ['debitMinor','creditMinor','netMinor','runningBalanceMinor'])assert(Number.isSafeInteger(r[k]));
  assert.equal(r.netMinor,r.debitMinor-r.creditMinor);assert.equal(r.beigeFlag,r.reviewIssues.length>0);assert.equal(r.highlightColor,r.beigeFlag?'#F2E4CC':null);
  assert(!r.blockMapping.references.some(b=>b.blockId&&!data.masterSnapshot.blocks.some(m=>m._id===b.blockId&&m.estateId===r.estateId)));
  if(!groups.has(r.accountKey))groups.set(r.accountKey,[]);groups.get(r.accountKey).push(r);
 }
 assert.equal(groups.size,13);
 for(const [key,rows]of groups){rows.sort((a,b)=>a.sourceSequence-b.sourceSequence);let balance=0;
  rows.forEach((r,i)=>{assert.equal(r.sourceSequence,i+1);balance+=r.netMinor;assert.equal(r.runningBalanceMinor,balance,`Running balance ${key}/${r.sourceSequence}`)});
  assert.equal(balance,accounts.get(key).netMinor,`Account reconciliation ${key}`);assert.equal(rows[0].rowKind,'opening_balance');
 }
 return {summaryRows:data.summary.length,detailRows:data.details.length,transactions:data.details.filter(r=>r.rowKind==='transaction').length,accountsWithDetails:groups.size,beigeDetails:data.details.filter(r=>r.beigeFlag).length,blockReviewDetails:data.details.filter(r=>r.reviewIssues.some(i=>i.category==='block_mapping')).length};
}
