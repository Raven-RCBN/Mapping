// Run on the approved iPlant SQL-access host; private environment is loaded by Node.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,list)=>i%2?a:[...a,[x.replace(/^--/,''),list[i+1]]],[]));
const {database,estate,from,to,output}=args;
if(!/^[A-Za-z0-9_]+$/.test(database||'')||!estate||estate.length>50||!output)throw Error('Supply --database, --estate, --from, --to and a new --output folder.');
for(const date of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||new Date(date).toISOString().slice(0,10)!==date)throw Error('Use valid ISO dates.');
const year=Number(from.slice(0,4));
if(from!==`${year}-01-01`||to!==`${year+1}-01-01`)throw Error('The annual sample templates require one full calendar-year interval.');
const sql=createRequire(process.env.IPLANT_CLIENT_PACKAGE||'/home/deploy_iplant2/app/package.json')('mssql');
const pool=await new sql.ConnectionPool({server:process.env.IPLANT_SQL_SERVER,port:Number(process.env.IPLANT_SQL_PORT||1433),database,user:process.env.IPLANT_SQL_USER,password:process.env.IPLANT_SQL_PASSWORD,requestTimeout:120000,connectionTimeout:15000,options:{encrypt:false,trustServerCertificate:true,readOnlyIntent:true}}).connect();
try{
 const identity=(await pool.request().input('EstateID',sql.NVarChar(50),estate).query('SELECT EstateID,EstateCode,EstateName FROM General.Estate WHERE EstateID=@EstateID')).recordset;
 if(identity.length!==1)throw Error('Estate identity not found or ambiguous.');
 if(args['expected-name']&&identity[0].EstateName!==args['expected-name'])throw Error('Source estate name does not match the expected estate.');
 if(!args['expected-name'])throw Error('Supply --expected-name after discovering the source estate identity.');
 await fs.mkdir(output,{mode:0o700});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const manifest={profile:'iplant-block-extraction-v1',extractedAt:new Date().toISOString(),database,estate:identity[0],sampleFrom:from,sampleToExclusive:to,coverage:'All historical years; samples use the requested year',queries:[]};
 for(const name of ['initial','coverage','summaries','validation','linkage']){
  const query=await fs.readFile(new URL(`../docs/iplant/sql/${name}.sql`,import.meta.url),'utf8');
  if(/\b(?:insert|update|delete|merge|exec|execute|drop|alter|create|truncate)\b/i.test(query.replace(/^--.*$/gm,'')))throw Error(`Non-SELECT statement in ${name}`);
  const request=pool.request().input('EstateID',sql.NVarChar(50),estate).input('FromDate',sql.Date,new Date(from)).input('ToDate',sql.Date,new Date(to)).input('Year',sql.Int,year);
  const result=await request.query(query),content=JSON.stringify(result.recordsets,null,2);
  await fs.writeFile(path.join(output,name+'.json'),content,{mode:0o600,flag:'wx'});
  manifest.queries.push({name,sha256:hash(query),resultSha256:hash(content),recordsetRows:result.recordsets.map(r=>r.length)});
 }
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({output,database,estate:identity[0].EstateCode,queries:manifest.queries.map(q=>({name:q.name,rows:q.recordsetRows}))}));
}finally{await pool.close();}
