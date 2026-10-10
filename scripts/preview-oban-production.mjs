import fs from 'node:fs/promises';
import mongoose from '../apps/api/node_modules/mongoose/index.js';
import * as models from '../apps/api/src/model/index.js';
import {createApp} from '../apps/api/src/app.js';
const db='MappingTest_ObanProductionPreview';
await mongoose.connect('mongodb://127.0.0.1:27018/'+db);
const gis=JSON.parse(await fs.readFile('data/estates/oban-nigeria/gis-import.json','utf8'));
const p=JSON.parse(await fs.readFile('data/production/oban-production.json','utf8'));
await models.Estate.updateOne({_id:gis.estateId},{$set:{name:'Oban Nigeria',location:'Nigeria',totalAreaHa:5000,boundary:gis.boundary}},{upsert:true});
for(const [Model,rows] of [[models.Block,gis.blocks],[models.ProductionName,p.names],[models.MonthlyProduction,p.monthly],[models.YearlyProduction,p.yearly]]){
 if(!await Model.countDocuments({estateId:gis.estateId}))await Model.insertMany(rows);
}
const app=await createApp({models,authMode:'development',dataDir:'/private/tmp/oban-preview-assets',origins:['http://127.0.0.1:4188'],apiPath:'/api/EstateAtlas',publicApiPath:'/api/EstateAtlas'});
const server=app.listen(4188,'127.0.0.1',()=>console.log('Oban production preview ready on 4188'));
process.on('SIGTERM',async()=>{server.close();await mongoose.disconnect();process.exit(0);});
