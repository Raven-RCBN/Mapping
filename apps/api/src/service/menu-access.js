import { permitted, isSuperuser } from '../../../../packages/shared/access.js';
// Unknown routes are denied for managed users. New endpoints must declare a menu.
export function routePolicy(method, pathname) {
  const p=pathname.replace(/\/$/,'') || '/';
  const read=['GET','HEAD'].includes(method);
  let menus, action=read?'view':method==='DELETE'?'delete':method==='POST'?'add':'edit', resource;
  if(p==='/bootstrap') return {bootstrap:true};
  if(p.startsWith('/user-access')||p==='/estates'||p==='/offline'||p==='/snapshot'||p.startsWith('/ai/')) return null;
  if(p==='/workspace') return {workspace:true};
  if(p==='/production/meta'&&read)return {menus:['names','monthly','yearly','comments'],any:true,action:'view'};
  if(/^\/estates\/[^/]+\/(images|boundary|qgis)$/.test(p)) {menus=['map'];resource=['Estate',p.split('/')[2]];if(p.endsWith('/boundary'))action='edit';}
  else if(/^\/assets\/[^/]+\//.test(p)){menus=['map'];resource=['Asset',p.split('/')[2]];}
  else if(/^\/document-imports(\/|$)/.test(p))menus=['imports'];
  else if(p==='/map-assets')menus=['map'];
  else if(/^\/geospatial-analysis(\/|$)/.test(p)&&read)menus=['map','geospatial'];
  else if(['/dashboard','/timeline','/map-popup','/activity-options'].includes(p)) {menus=['map','harvesting','field'];action='view';if(p==='/timeline')menus.push('history');if(!read&&method!=='POST')return null;}
  else if(/^\/records\/(blocks|harvesting|field)$/.test(p)) {menus=[p.split('/')[2]];action='view';if(!read&&method!=='POST')return null;}
  else if(/^\/(blocks|harvesting|field-activities|activities)(\/|$)/.test(p)) {
    const kind=p.split('/')[1];menus=[kind==='field-activities'?'field':kind==='activities'?'map':kind];
    if(p.split('/')[2])resource=[{blocks:'Block',harvesting:'HarvestingActivity','field-activities':'FieldActivity',activities:'Activity'}[kind],p.split('/')[2]];
  }
  else if(p==='/sources')menus=['sources'];
  else if(p.startsWith('/production/')) {
    const kind=p.split('/')[2];
    const mapping={meta:['names'],names:['names'],monthly:['monthly'],yearly:['yearly'],comments:['comments'],recorded:['monthly'],allocated:['monthly','names'],import:['monthly','names'],'decision-support':['decisions','monthly','yearly','names']};
    menus=mapping[kind];
    if(kind==='import')menus=['monthly'];
  }
  else if(p.startsWith('/data-tables/'))menus=[({areas:'wages',parameters:'names'})[p.split('/')[2]]||p.split('/')[2]];
  else if(/^\/wages(\/|$)/.test(p)){menus=['wages'];}
  else if(/^\/vehicles(\/|$)/.test(p))menus=['vehicles'];
  else if(/^\/trial-balance(\/|$)/.test(p))menus=['trial-balance'];
  else if(p==='/storage'&&read)menus=['storage'];
  else if(['/storage/preview','/storage/apply'].includes(p)&&method==='POST'){menus=['storage'];action='delete';}
  else if(/^\/storage\/[^/]+\/restore$/.test(p)&&method==='POST'){menus=['storage'];action='edit';resource=['Asset',p.split('/')[2]];}
  else if(p==='/archives'&&read)menus=['archive'];
  else if(['/yield-model','/decision-weather','/hts-analysis'].includes(p))menus=['decisions','monthly','yearly','names','wages','trial-balance'];
  if(!menus)return null;
  return {menus,action,resource};
}
export function menuAccess(models) {
  return async(req,res,next)=>{
    try {
      // Legacy external JWT integrations retain their existing contract; managed
      // Mapping sessions always set managed=true, including unconfigured users.
      if(isSuperuser(req.access)||!req.access.managed)return next();
      const rule=routePolicy(req.method,req.path);
      const deny=()=>res.status(403).json({error:'Your permissions do not allow this action in this location.'});
      if(!rule)return deny();
      if(['/production/recorded','/production/allocated'].includes(req.path)) rule.menus=[req.query.frequency==='monthly'?'monthly':'yearly'];
      if(rule.bootstrap||rule.workspace)return next();
      const allowed=(req.access.estateIds||[]).filter(id=>rule.menus[rule.any?'some':'every'](menu=>permitted(req.access,id,menu,rule.action)));
      if(!allowed.length)return deny();
      if(rule.resource){
        const [model,id]=rule.resource;
        const record=await models[model].findById(id).select('estateId').lean();
        if(!record||!allowed.includes(model==='Estate'?record._id:record.estateId))return deny();
      }
      // Never trust a caller-supplied scope to override the resource's location.
      for(const obj of [req.query,req.body]) {
        if(!obj)continue;
        const requested=[...(obj.estateId?[String(obj.estateId)]:[]),...(obj.estates?String(obj.estates).split(',').filter(Boolean):[])];
        if(requested.some(id=>!allowed.includes(id)))return deny();
      }
      req.access={...req.access,estateIds:allowed};
      next();
    }catch(error){next(error);}
  };
}
