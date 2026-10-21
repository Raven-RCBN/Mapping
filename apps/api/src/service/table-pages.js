import {createHash} from 'node:crypto';
import {QueryError} from './performance.js';
export const searchLiteral=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function cursorFilter(cursor,order,fingerprint){
 if(!cursor)return {};
 let c;try{c=JSON.parse(Buffer.from(cursor,'base64url').toString())}catch{throw new QueryError('Invalid page cursor. Start at the first page.')}
 const keys=Object.keys(order);
 if(c.f!==fingerprint||!Array.isArray(c.values)||c.values.length!==keys.length||c.values.some(v=>!['string','number'].includes(typeof v)||(typeof v==='string'&&v.length>2000)))throw new QueryError('This page cursor does not match the current filters. Start at the first page.');
 return {$or:keys.map((key,i)=>Object.fromEntries([...keys.slice(0,i).map((k,j)=>[k,c.values[j]]),[key,{[order[key]>0?'$gt':'$lt']:c.values[i]}]]))};
}
export function nextPage(found,limit,order,fingerprint){
 const items=found.slice(0,limit),last=items.at(-1);
 return {items:items.map(r=>({...r,id:r.id||r._id})),nextCursor:found.length>limit?Buffer.from(JSON.stringify({f:fingerprint,values:Object.keys(order).map(k=>last[k])})).toString('base64url'):null};
}
export async function databasePage(Model,where,{cursor,limit=25,order={_id:1},project={history:0},group={count:{$sum:1}},pipeline=[],singlePass=false,offset=0}={}){
 const fingerprint=createHash('sha256').update(JSON.stringify([Model.collection.name,where,order,pipeline,limit])).digest('hex'),after=cursorFilter(cursor,order,fingerprint);
 // Only a single page crosses the DB boundary; group totals are calculated in MongoDB.
 const base=[{$match:where},...pipeline];
 let found,totals;try{if(singlePass){const [result]=await Model.aggregate([...base,{$facet:{items:[{$match:after},{$sort:order},...(offset?[{$skip:offset}]:[]),{$limit:limit+1},{$project:project}],totals:[{$group:{_id:null,...group}}]}}]).option({maxTimeMS:10000,allowDiskUse:true});found=result.items;totals=result.totals;}else [found,totals]=await Promise.all([
  Model.aggregate([...base,{$match:after},{$sort:order},...(offset?[{$skip:offset}]:[]),{$limit:limit+1},{$project:project}]).option({maxTimeMS:10000,allowDiskUse:true}),
  Model.aggregate([...base,{$group:{_id:null,...group}}]).option({maxTimeMS:10000,allowDiskUse:true}),
 ]);}catch(error){if(error.code===50)throw new QueryError('This report is too large. Narrow the year, period or search filters and retry.',413);throw error;}
 const summary=totals[0]||Object.fromEntries(Object.keys(group).map(k=>[k,0]));delete summary._id;
 return {...nextPage(found,limit,order,fingerprint),count:summary.count,...summary,limit};
}
