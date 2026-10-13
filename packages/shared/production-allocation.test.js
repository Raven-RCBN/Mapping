import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocateProduction} from './production-allocation.js';
const names=[{_id:'a',division:'D',mapBlockCode:'A'},{_id:'b',division:'D',mapBlockCode:'B'},{_id:'c',division:'E',mapBlockCode:'C'}];
const blocks=[{blockCode:'A',division:'D',totalPalms:100,palmsPerHectare:50},{blockCode:'B',division:'D',totalPalms:300,palmsPerHectare:100},{blockCode:'C',division:'E',totalPalms:100,palmsPerHectare:100}];
const row=(sourceBlockId,mt,extra={})=>({sourceBlockId,mt,effectiveHa:{a:2,b:3,c:1}[sourceBlockId],receiptStatus:'received',month:'2025-12',year:2025,periodLabel:'Full year',...extra});
test('division tonnage is allocated by block palms and reconciles independently by division',()=>{
 const source=[row('a',350),row('b',50),row('c',20)],copy=JSON.stringify(source);
 const a=allocateProduction(source,names,blocks,['A','B','C'],{annual:true});
 assert.deepEqual(a.items.map(r=>r.mt),[100,300,20]);
 assert.equal(a.items[0].effectiveHa,2);assert.equal(a.items[0].yieldPerHa,50);
 assert.equal(a.items[1].effectiveHa,3);assert.equal(a.items[1].yieldPerHa,100);
 assert.equal(a.items[0].divisionPalms,400);assert.equal(JSON.stringify(source),copy);
});
test('pool includes separate source records and counts shared mapped inventory palms once',()=>{
 const a=allocateProduction([row('a',1),row('b',2)],names,[...blocks,blocks[0]],['A','B'],{annual:true});
 assert.equal(a.items.length,2);assert.equal(a.items[0].divisionPalms,400);assert.equal(a.items.reduce((n,r)=>n+r.mt,0),3);
});
test('missing palms invalidate the division, missing effective hectares only invalidate yield, zero remains zero',()=>{
 let b=blocks.map(x=>({...x}));b[1].totalPalms=null;
 let a=allocateProduction([row('a',400)],names,b,['A','B'],{annual:true});assert.ok(a.items.every(r=>r.mt===null));
 b=blocks.map(x=>({...x}));b[0].palmsPerHectare=null;
 a=allocateProduction([row('a',400,{effectiveHa:null})],names,b,['A','B'],{annual:true});assert.equal(a.items[0].mt,100);assert.equal(a.items[0].yieldPerHa,null);
 a=allocateProduction([row('a',0),row('b',0)],names,blocks,['A','B'],{annual:true});assert.ok(a.items.every(r=>r.mt===0&&r.yieldPerHa===0));
});
test('months and years stay separate and unavailable or mismatched reporting periods cannot become zero',()=>{
 const a=allocateProduction([row('a',100,{month:'2025-01'}),row('a',200,{month:'2025-02'}),row('a',0,{month:'2025-03',receiptStatus:'not_received'})],names,blocks,['A','B']);
 assert.deepEqual(a.items.filter(r=>r.mapBlockCode==='A').map(r=>r.mt),[25,50,null]);
 const b=allocateProduction([row('a',100),row('b',200,{month:'2025-07',periodLabel:'Jan–Jul YTD'})],names,blocks,['A','B'],{annual:true});assert.ok(b.items.every(r=>r.mt===null));
});

test('tonnage-derived ABW changes with allocation while recorded bunch counts stay at their block',()=>{
 const a=allocateProduction([row('a',350,{bunches:10000}),row('b',50,{bunches:20000})],names,blocks,['A','B'],{annual:true});
 assert.equal(a.items[0].mt,100);assert.equal(a.items[0].bunches,10000);assert.equal(a.items[0].abw,10);assert.equal(a.items[1].abw,15);
 assert.equal(a.items[0].bunchesPerHa,5000);assert.equal(a.items[0].bunchesPerPalm,100);
});


test('yield uses existing period effective hectares, independently of planting density',()=>{
 const b=[{blockCode:'E17',division:'D',totalPalms:2309,palmsPerHectare:88}];
 const n=[{_id:'e17',division:'D',mapBlockCode:'E17'}];
 const a=allocateProduction([row('e17',240.24219147927386,{month:'2025-01',effectiveHa:16.482517482517483}),row('e17',240.24219147927386,{month:'2025-02',effectiveHa:12})],n,b,['E17']);
 assert.equal(a.items[0].effectiveHa,16.482517482517483);assert.equal(a.items[0].yieldPerHa.toFixed(2),'14.58');
 assert.equal(a.items[1].yieldPerHa,240.24219147927386/12);
 for(const effectiveHa of [null,undefined,0,-1]){
  const r=allocateProduction([row('e17',240,{effectiveHa})],n,b,['E17']).items[0];
  assert.equal(r.mt,240);assert.equal(r.effectiveHa,null);assert.equal(r.yieldPerHa,null);
 }
});
test('shared polygons sum separate source effective areas once while inventory palms stay unique',()=>{
 const n=[...names,{_id:'a2',division:'D',mapBlockCode:'A'}];
 const a=allocateProduction([row('a',300),row('a2',50,{effectiveHa:3}),row('b',50)],n,blocks,['A','B'],{annual:true});
 assert.equal(a.items[0].totalPalms,100);assert.equal(a.items[0].mt,100);assert.equal(a.items[0].effectiveHa,5);assert.equal(a.items[0].yieldPerHa,20);
});
