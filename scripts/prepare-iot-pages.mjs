// Run on the data host; original private exports/index stay intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function prepareIotPages(folder){
 const bytes=await fs.readFile(path.join(folder,'index.json')),sourceSha256=createHash('sha256').update(bytes).digest('hex'),data=JSON.parse(bytes);
 const root=path.join(folder,'pages'),generation=sourceSha256,dir=path.join(root,generation);await fs.mkdir(dir,{recursive:true});
 const metadata={summary:data.summary,blocks:data.blocks,contexts:data.contexts};
 await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(metadata),{mode:0o600});
 const works=['harvester','circle_spraying','grabber_truck','tractor_slasher'];
 const months=[...new Set([...data.summary.monthly_comparison.map(r=>r.month),...data.dailyRecords.map(r=>r.month)])];
 const periods=works.flatMap(work=>months.map(month=>JSON.stringify([work,month])));
 for(const encoded of periods){const [work,month]=JSON.parse(encoded);if(!['harvester','circle_spraying','grabber_truck','tractor_slasher'].includes(work)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Invalid movement period');
  const period={dailyRecords:data.dailyRecords.filter(r=>r.work===work&&r.month===month),coverage:data.coverage.filter(r=>r.work===work&&r.month===month),dailyCoverage:data.dailyCoverage.filter(r=>r.work===work&&r.date.startsWith(month+'-')),comparison:data.comparison.filter(r=>r.month===month),dailyComparison:data.dailyComparison.filter(r=>r.date.startsWith(month+'-'))};
  await fs.writeFile(path.join(dir,work+'-'+month+'.json'),JSON.stringify(period),{mode:0o600});
 }
 const manifest={version:1,generation,sourceSha256,periods:periods.length,records:data.dailyRecords.length};
 await fs.writeFile(path.join(root,'manifest.next.json'),JSON.stringify(manifest),{mode:0o600});await fs.rename(path.join(root,'manifest.next.json'),path.join(root,'manifest.json'));
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2])throw Error('Usage: node scripts/prepare-iot-pages.mjs PRIVATE_IOT_FOLDER');console.log(JSON.stringify(await prepareIotPages(process.argv[2])));}
