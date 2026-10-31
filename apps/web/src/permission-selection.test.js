import {test} from 'node:test';import assert from 'node:assert/strict';
import {columnSelection,selectPermissionColumn,userAccessLanding} from './permission-selection.js';
import {accessMenus} from '../../../packages/shared/access.js';
test('column selection affects only supported actions in the selected estate and preserves its input',()=>{
 const original={dafa:{comments:['view','edit'],storage:['view','edit']},other:{map:['view']}};
 const before=JSON.stringify(original),added=selectPermissionColumn(original,'dafa','add',true);
 assert.equal(JSON.stringify(original),before);assert.equal(added.other,original.other);assert.deepEqual(added.dafa.vehicles,['view','add']);assert.deepEqual(added.dafa.storage,['view','edit']);assert.deepEqual(added.dafa.comments,['view','edit','add']);assert.equal(columnSelection(added.dafa,'add').all,true);assert.equal(columnSelection(added.dafa,'view').some,true);
 const deleted=selectPermissionColumn(original,'dafa','delete',true);assert.deepEqual(deleted.dafa.storage,['view','edit','delete']);assert.deepEqual(deleted.dafa.comments,['view','edit','delete']);assert.equal(deleted.dafa.map,undefined);
 const cleared=selectPermissionColumn(deleted,'dafa','view',false);assert.ok(accessMenus.every(([k])=>!cleared.dafa[k].length));assert.deepEqual(cleared.other,original.other);
});
test('clearing an action column retains view and other actions',()=>{
 const p=selectPermissionColumn({dafa:{map:['view','edit']}},'dafa','add',true),cleared=selectPermissionColumn(p,'dafa','add',false);
 assert.deepEqual(cleared.dafa.map,['view','edit']);assert.ok(!columnSelection(cleared.dafa,'add').all);assert.equal(columnSelection({},'view').some,false);
});
test('non-superuser sign-in at user-access lands in an allowed workspace without elevated grants',()=>{
 const leslie={subject:'Leslie',role:'manager',estateIds:['dafa'],permissions:{dafa:Object.fromEntries(accessMenus.map(([k])=>[k,['view']]))}};
 const before=JSON.stringify(leslie);assert.deepEqual(userAccessLanding(leslie,'dafa'),{});assert.equal(JSON.stringify(leslie),before);
 const dataOnly={estateIds:['dafa'],permissions:{dafa:{wages:['view']}}};assert.deepEqual(userAccessLanding(dataOnly,'dafa'),{view:'data'});
 assert.deepEqual(userAccessLanding({estateIds:['dafa'],permissions:{dafa:{storage:['view']}}},'dafa'),{view:'storage'});
 assert.equal(userAccessLanding({isSuperuser:true},'dafa'),null);
});
