// Execute only on the approved iPlant host. No source writes or stored procedures.
const fs=require('node:fs'),crypto=require('node:crypto');
const sql=require('/home/deploy_iplant2/app/node_modules/mssql');
const env=Object.fromEntries(fs.readFileSync('/home/deploy_iplant2/app.env','utf8').split(/\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{let i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const output=process.argv[2];if(!output)throw Error('New private output directory required');
const tables={
'General.BlockMaster':'EstateID','General.Division':'EstateID','General.YOP':'EstateID','General.ActiveMonthYear':'EstateID','General.CropYield':null,'General.UOM':null,'General.ActivityMaster':'EstateID',
'Checkroll.CropStatement':'EstateID','Checkroll.DailyAttendance':'EstateID','Checkroll.DailyReceiption':'EstateID','Checkroll.DailyActivityDistribution':'EstateID',
'Accounts.COA':'EstateID','Accounts.LedgerAllModule':'EstateID','Accounts.JournalDetail':'EstateID','dbo.CheckrollTemp':'Location',
'Store.STIssue':'EstateID','Store.STIssueDetails':'EstateID','Store.STMaster':'EstateID','Store.STCategory':'EstateID','Store.STReturnGoodsNote':'EstateID','Store.STReturnGoodsDetails':'EstateID',
'Vehicle.VHMaster':'EstateID','Vehicle.VHDistribution':'EstateID'};
(async()=>{const p=await new sql.ConnectionPool({server:env.IPLANT_SQL_SERVER,port:Number(env.IPLANT_SQL_PORT||1433),database:'ONG_SLD_TEST',user:env.IPLANT_SQL_USER,password:env.IPLANT_SQL_PASSWORD,connectionTimeout:15000,requestTimeout:180000,options:{encrypt:false,trustServerCertificate:true,readOnlyIntent:true}}).connect();try{
const identity=(await p.request().query("SELECT EstateID,EstateCode,EstateName FROM General.Estate WHERE EstateID='OP3'")).recordset;
if(identity.length!==1||identity[0].EstateName!=='SYARIKAT LADANG DAFA SDN BHD')throw Error('Estate identity mismatch');
fs.mkdirSync(output,{mode:0o700});let manifest={database:'ONG_SLD_TEST',estate:identity[0],extractedAt:new Date().toISOString(),tables:[]};
async function save(name,query){let r=(await p.request().input('estate',sql.NVarChar(50),'OP3').query(query)).recordset;let data=JSON.stringify(r);fs.writeFileSync(output+'/'+name+'.json',data,{mode:0o600,flag:'wx'});manifest.tables.push({name,rows:r.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),query});console.log(name,r.length);}
for(let [name,col]of Object.entries(tables))await save(name,`SELECT * FROM ${name}${col?' WHERE '+col+'=@estate':''}`);
await save('Checkroll.CREmployee','SELECT EmpID,EmpCode,EmpName FROM Checkroll.CREmployee WHERE EstateID=@estate');
await save('Checkroll.DailyReceptionWithTeam','SELECT t.* FROM Checkroll.DailyReceptionWithTeam t WHERE EXISTS(SELECT 1 FROM Checkroll.DailyReceiption r WHERE r.EstateID=@estate AND r.DailyReceiptionDetID=t.DailyReceiptionDetID)');
fs.writeFileSync(output+'/manifest.json',JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
}finally{await p.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
