import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import mongoose from '../../apps/api/node_modules/mongoose/index.js';
const [filename,mode]=process.argv.slice(2),estateId='673eebaf-1532-4590-9957-537373f1928d';
const conn=await mongoose.createConnection(process.env.MONGODB_URI).asPromise();let receipt={};
for(const {name}of await conn.db.listCollections().toArray()){
 if(!name.startsWith('mapping')||name==='mappingsources')continue;
 const coll=conn.db.collection(name),h=createHash('sha256');let count=0;
 for await(const d of coll.find({estateId:{$ne:estateId},_id:{$ne:estateId}}).sort({_id:1})){h.update(JSON.stringify(d));count++;}
 receipt[name]={count,sha256:h.digest('hex')};
}
if(mode==='before')await fs.writeFile(filename,JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});else{const before=JSON.parse(await fs.readFile(filename,'utf8'));for(const [k,v]of Object.entries(before))if(JSON.stringify(v)!==JSON.stringify(receipt[k]))throw Error('Other-estate data changed: '+k);}
console.log(JSON.stringify({preserved:true,mode,collections:Object.keys(receipt).length}));await conn.close();
