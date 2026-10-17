import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {QueryError} from '../performance.js';

export const CAP=100_000_000_000; // integer nanodollars: US$100, no runtime increase
export const monthKey=date=>date.toISOString().slice(0,7);
const fail=(message,status=409)=>{throw new QueryError(message,status);};

// One shared directory per deployment. Atomic mkdir serializes all workers. A
// crashed lock deliberately fails closed; an operator must verify no request is
// running before removing it. Never expire a lock and risk double spending.
export class AIBudget {
 constructor(dir,clock=()=>new Date()){this.dir=dir;this.clock=clock;}
 async transaction(update,afterCommit){
  await fs.mkdir(this.dir,{recursive:true,mode:0o700});
  const lock=path.join(this.dir,'ledger.lock');
  let acquired=false;
  for(let i=0;i<100;i++){
   try{await fs.mkdir(lock,{mode:0o700});acquired=true;break;}
   catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,20));}
  }
  if(!acquired)fail('AI budget is busy or requires operator recovery. No request was sent.',503);
  try{
   let state;
   try{state=JSON.parse(await fs.readFile(path.join(this.dir,'ledger.json'),'utf8'));}
   catch(e){
    if(e.code!=='ENOENT')fail('AI budget could not be verified. Live requests are stopped.',503);
    try{const marker=await fs.open(path.join(this.dir,'initialized'),'wx',0o600);try{await marker.writeFile('AI ledger initialized; missing ledger requires operator recovery.');await marker.sync();}finally{await marker.close();}}
    catch{fail('AI ledger is missing after initialization. Live requests are stopped.',503);}
    state={version:1,enabled:false,months:{}};
   }
   if(state.version!==1||typeof state.enabled!=='boolean'||!state.months||Array.isArray(state.months))fail('AI budget could not be verified.',503);
   for(const m of Object.values(state.months)){
    if(!m.entries||Object.values(m.entries).some(e=>!Number.isSafeInteger(e.charge)||e.charge<0)||!Number.isSafeInteger(m.used)||m.used<0||m.used!==Object.values(m.entries).reduce((n,e)=>n+e.charge,0))fail('AI ledger integrity check failed.',503);
   }
   const result=await update(state);
   const temp=path.join(this.dir,randomUUID()+'.tmp');
   const file=await fs.open(temp,'wx',0o600);
   try{await file.writeFile(JSON.stringify(state));await file.sync();}finally{await file.close();}
   await fs.rename(temp,path.join(this.dir,'ledger.json'));
   const directory=await fs.open(this.dir,'r');try{await directory.sync();}finally{await directory.close();}
   // Provider dispatch is started under this lock AFTER durable reservation,
   // so a committed admin pause cannot race a new dispatch.
   afterCommit?.(result);
   return result;
  }finally{await fs.rmdir(lock);}
 }
 async status(){return this.transaction(s=>{const m=s.months[monthKey(this.clock())];return {enabled:s.enabled,month:monthKey(this.clock()),capUsd:100,usedUsd:(m?.used||0)/1e9,reset:'UTC calendar month',includesPending:true};});}
 async enable(enabled,subject){return this.transaction(s=>{s.enabled=enabled;s.updatedBy=subject;s.updatedAt=this.clock().toISOString();return {enabled};});}
 async reserve({id,hash,subject,amount}){
  return this.transaction(s=>{
   // Search retained months too: a retry after UTC rollover cannot pay twice.
   for(const [month,m] of Object.entries(s.months)){const prior=m.entries[id];if(prior){if(prior.hash!==hash||prior.subject!==subject)fail('Request ID already used for another request.');return {month,entry:prior,reused:true};}}
   if(!s.enabled)fail('Live AI is paused.',423);
   const month=monthKey(this.clock()),m=s.months[month]??={used:0,entries:{}};
   if(!Number.isSafeInteger(amount)||amount<=0||m.used+amount>CAP)fail('US$100 monthly AI application budget reached. Ask the owner before adding more.',402);
   const recent=Object.values(m.entries).filter(e=>e.subject===subject&&Date.parse(e.createdAt)>this.clock().getTime()-60000);
   if(recent.length>=10||Object.values(m.entries).some(e=>e.subject===subject&&['reserved','dispatched'].includes(e.status)))fail('Wait before sending another live request.',429);
   const entry={hash,subject,charge:amount,reservation:amount,status:'reserved',createdAt:this.clock().toISOString()};
   m.entries[id]=entry;m.used+=amount;return {month,entry,reused:false};
  });
 }
 async dispatch(month,id,start){
  let started=false;
  const result=await this.transaction(s=>{
   const m=s.months[month],e=m?.entries[id];
   if(e?.status!=='reserved')fail('Request cannot be dispatched again.');
   if(!s.enabled||month!==monthKey(this.clock())){m.used-=e.charge;e.charge=0;e.status='cancelled';return false;}
   e.status='dispatched';return true;
  },ready=>{if(ready){started=true;start();}});
  if(!started||!result)fail('AI paused or month changed before dispatch. No provider request was sent.',423);
 }
 async finish(month,id,{cost,response}){
  return this.transaction(s=>{
   const m=s.months[month],e=m.entries[id];
   if(e.status!=='dispatched')fail('Request settlement state is invalid.',503);
   const metered=Number.isSafeInteger(cost)&&cost>=0&&cost<=e.reservation;
   // Unknown/error outcomes retain the full reservation and cannot auto-retry.
   if(metered){m.used+=cost-e.charge;e.charge=cost;}
   else if(Number.isSafeInteger(cost)&&cost>e.reservation){s.enabled=false;}
   e.status=response?'completed':'unknown';
   if(response)e.response=response;
   e.finishedAt=this.clock().toISOString();
  });
 }
}
