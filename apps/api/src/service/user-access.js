import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { sessionModels, passwordHash } from './session-auth.js';
import { QueryError } from './performance.js';
import {currencyCodes,resolveCurrency} from '../../../../packages/shared/currency.js';
import { accessMenus, isSuperuser } from '../../../../packages/shared/access.js';
const key = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
const input = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{2,99}$/),
  name: z.string().trim().min(1).max(100), password: z.string().min(12).max(1024).optional(),
  active: z.boolean(), estateIds: z.array(key).max(100),
  permissions: z.record(key, z.record(z.string(), z.array(z.enum(['view','add','edit','delete'])).max(4))),
  revision: z.number().int().nonnegative().optional(),
}).strict();
export function requireSuperuser(req, res, next) {
  if (!isSuperuser(req.access)) return res.status(403).json({error:'Superuser access is required.'});
  next();
}
export async function createLocation(models, config, body) {
  const data = z.object({name:z.string().trim().min(1).max(100), location:z.string().trim().max(150).default(''), currency:z.enum(currencyCodes), totalAreaHa:z.number().finite().min(0).nullable().optional()}).strict().parse(body);
  if (await models.Estate.exists({name:{$regex:`^${data.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,$options:'i'}})) throw new QueryError('A location with this name already exists.',409);
  const estateId = randomUUID();
  const folder = path.join(config.dataDir,'estates',estateId);
  await fs.mkdir(folder,{recursive:true,mode:0o750});
  try {
    for (const child of ['images','boundaries','imports']) await fs.mkdir(path.join(folder,child),{mode:0o750});
    const doc = await models.Estate.create({_id:estateId,...data,nameKey:data.name.toLowerCase()});
    const {_id,__v,...rest} = doc.toObject();
    return {...rest,id:_id};
  } catch(error) { await fs.rm(folder,{recursive:true,force:true}); if(error.code===11000)throw new QueryError('A location with this name already exists.',409); throw error; }
}
export function installUserAccess(api, models, config) {
  const {User,Session} = sessionModels(models.Estate.db);
  const clean = u => ({username:u._id,name:u.name || u._id,active:u.active,isSuperuser:u._id==='Admin'&&u.role==='admin',estateIds:u.estateIds||[],permissions:u.permissions||{},revision:u.revision||0});
  api.get('/user-access/users',requireSuperuser,async(req,res)=>{
    const q=z.object({after:z.string().max(100).optional(),q:z.string().max(100).default('')}).parse(req.query);
    const where={...(q.after?{_id:{$gt:q.after}}:{}),...(q.q?{$or:[{_id:{$regex:q.q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'}},{name:{$regex:q.q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'}}]}:{})};
    const rows=await User.find(where).select('-passwordHash').sort({_id:1}).limit(26).lean();
    res.json({items:rows.slice(0,25).map(clean),next:rows.length>25?rows[24]._id:null});
  });
  async function save(req,res) {
    const data=input.parse(req.body), editing=req.method==='PATCH';
    if(data.username==='Admin'||(editing&&req.params.id==='Admin')) throw new QueryError('The superuser account is protected.',403);
    if(editing&&data.username!==req.params.id) throw new QueryError('Usernames cannot change.');
    if(!editing&&!data.password) throw new QueryError('Set a password of at least 12 characters.');
    if(new Set(data.estateIds).size!==data.estateIds.length) throw new QueryError('Choose each location once.');
    if(await models.Estate.countDocuments({_id:{$in:data.estateIds}})!==data.estateIds.length) throw new QueryError('A selected location no longer exists.');
    for(const [estate, menus] of Object.entries(data.permissions)) {
      if(!data.estateIds.includes(estate)) throw new QueryError('Permissions must belong to assigned locations.');
      for(const [menu,actions] of Object.entries(menus)) {
        const definition=accessMenus.find(row=>row[0]===menu);
        if(!definition||actions.some(a=>!definition[2].includes(a))||(actions.length&&!actions.includes('view'))) throw new QueryError('Invalid menu permissions. View is required for other actions.');
      }
    }
    const changes={name:data.name,active:data.active,estateIds:data.estateIds,permissions:data.permissions,role:'manager',updatedBy:req.access.subject};
    if(data.password) changes.passwordHash=await passwordHash(data.password);
    let user;
    if(editing) {
      if(data.revision===undefined) throw new QueryError('Reload the user before editing.',409);
      user=await User.findOneAndUpdate({_id:req.params.id,revision:data.revision},{$set:changes,$inc:{revision:1}},{new:true}).lean();
      if(!user) throw new QueryError('User changed. Reload before saving.',409);
      await Session.deleteMany({subject:user._id});
    } else {
      try {user=(await User.create({_id:data.username,...changes,revision:0})).toObject();}
      catch(e){if(e.code===11000)throw new QueryError('That username already exists.',409);throw e;}
    }
    res.status(editing?200:201).json(clean(user));
  }
  api.post('/user-access/users',requireSuperuser,save);
  api.patch('/user-access/users/:id',requireSuperuser,save);
  api.post('/user-access/locations',requireSuperuser,async(req,res)=>res.status(201).json(await createLocation(models,config,req.body)));
  api.patch('/user-access/locations/:id/currency',requireSuperuser,async(req,res)=>{
    const estateId=key.parse(req.params.id),body=z.object({currency:z.enum(currencyCodes),expectedCurrency:z.enum(currencyCodes).nullable()}).strict().parse(req.body);
    const estate=await models.Estate.findById(estateId).select('name currency').lean();
    if(!estate)throw new QueryError('Estate not found',404);
    if((estate.currency||null)!==body.expectedCurrency)throw new QueryError('Estate settings changed. Reload before saving.',409);
    const sources=['Wage','VehicleImport','VehicleTransaction','TrialBalanceSummary','TrialBalanceDetail'].map(n=>models[n]).filter(Boolean);
    const values=(await Promise.all(sources.map(m=>m.distinct('currency',{estateId})))).flat();
    try{resolveCurrency(body.currency,values);}catch(e){throw new QueryError(e.message+' Changing setup does not convert existing amounts.',409);}
    const changed=await models.Estate.updateOne({_id:estateId,currency:estate.currency||null},{$set:{currency:body.currency,currencyUpdatedAt:new Date(),currencyUpdatedBy:req.access.subject},$push:{currencyHistory:{at:new Date(),by:req.access.subject,previous:estate.currency||null,currency:body.currency}}});
    if(!changed.matchedCount)throw new QueryError('Estate settings changed. Reload before saving.',409);
    res.json({id:estateId,currency:body.currency});
  });
}
