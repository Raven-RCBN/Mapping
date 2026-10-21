import {accessMenus,dataMenus,isSuperuser,permitted} from '../../../packages/shared/access.js';
export function columnSelection(menus={},action){
 const eligible=accessMenus.filter(([, ,actions])=>actions.includes(action));
 const count=eligible.filter(([key])=>menus[key]?.includes(action)).length;
 return {all:eligible.length>0&&count===eligible.length,some:count>0&&count<eligible.length};
}
export function selectPermissionColumn(permissions,estateId,action,checked){
 const menus={...permissions[estateId]};
 for(const [key,,supported] of accessMenus){
  if(!supported.includes(action))continue;
  const actions=new Set(menus[key]||[]);
  if(checked){actions.add('view');actions.add(action);}else if(action==='view'){actions.clear();}else actions.delete(action);
  menus[key]=[...actions];
 }
 return {...permissions,[estateId]:menus};
}
export function userAccessLanding(access,estateId){
 if(isSuperuser(access))return null;
 if(permitted(access,estateId,'map'))return {};
 if(dataMenus.some(menu=>permitted(access,estateId,menu)))return {view:'data'};
 if(permitted(access,estateId,'storage'))return {view:'storage'};
 if(permitted(access,estateId,'archive'))return {view:'archive'};
 return {};
}
