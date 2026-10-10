// Owner-requested cleanup of zero-value MILL task cells, with a private recovery copy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from '../../apps/api/node_modules/mongoose/index.js';
import {Wage} from '../../apps/api/src/model/index.js';
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try {
  const where={estateId:'f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae',sourceSystem:'oban-wages-2025-workbook',task:'MILL',basis:'annual_summary',period:'2025'};
  const rows=await Wage.find(where).lean();
  assert.ok(rows.length===0||rows.length===27,'Unexpected MILL record count');
  assert.ok(rows.every(r=>r.amountMinor===0&&r.revision===0),'MILL records have been edited; inspect before removal');
  if(rows.length){
    const dir=path.join(process.env.DATA_DIR,'wages-imports');
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(dir,Date.now()+'-removed-mill.json'),JSON.stringify(rows),{mode:0o600,flag:'wx'});
    const result=await Wage.deleteMany({...where,_id:{$in:rows.map(r=>r._id)},amountMinor:0,revision:0});
    assert.equal(result.deletedCount,rows.length);
  }
  console.log(JSON.stringify({removed:rows.length,allocatedCostsUnchanged:true}));
}finally{await mongoose.disconnect();}
