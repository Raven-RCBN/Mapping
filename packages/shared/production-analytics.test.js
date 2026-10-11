import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyseYield} from './production-analytics.js';
const row=(code,yieldPerHa,extra={})=>({year:2025,mapBlockCode:code,sourceBlockId:code,receiptStatus:'received',yieldPerHa,yieldAreaHa:10,...extra});
test('strict thresholds use raw values and the requested year',()=>{
 const rows=[row('A',20),row('B',20.00001),row('C',19.99999),row('D',30,{year:2024})];
 const above=analyseYield(rows,['A','B','C','D'],{year:'2025',operator:'gt',threshold:'20'});
 assert.deepEqual(above.blockCodes,['B']);assert.equal(above.eligibleBlocks,3);assert.deepEqual(above.missingBlocks,['D']);
 assert.deepEqual(analyseYield(rows,['A','B','C','D'],{year:2025,operator:'lt',threshold:20}).blockCodes,['C']);
});
test('unreceived, unavailable, invalid areas and unmapped rows are not low-yield matches; actual zero is',()=>{
 const rows=[row('A',0),row('B',0,{receiptStatus:'not_received'}),row('C',null),row('D',2,{yieldAreaHa:0}),row('E',3,{receiptStatus:'unavailable'}),row('outside',1)];
 const result=analyseYield(rows,['A','B','C','D','E','F'],{year:2025,operator:'lt',threshold:15});
 assert.deepEqual(result.blockCodes,['A']);assert.equal(result.matches.length,1);assert.deepEqual(result.missingBlocks,['B','C','D','E','F']);
});
test('shared polygons match any separate source without summing yields or double-counting polygons',()=>{
 const rows=[row('F8+F9A',22,{sourceBlockId:'F08'}),row('F8+F9A',24,{sourceBlockId:'F09A'}),row('G8+G7A',10,{sourceBlockId:'G08'})];
 const result=analyseYield(rows,['F8+F9A','G8+G7A'],{year:2025,operator:'gt',threshold:20});
 assert.deepEqual(result.blockCodes,['F8+F9A']);assert.equal(result.matches.length,2);assert.deepEqual(result.matches.map(r=>r.yieldPerHa),[24,22]);
});
test('empty years and invalid thresholds never create highlights',()=>{
 const rows=[row('A',25)];
 for(const threshold of ['',-1,'abc',Infinity])assert.equal(analyseYield(rows,['A'],{year:2025,operator:'gt',threshold}).matches.length,0);
 assert.equal(analyseYield(rows,['A'],{year:2026,operator:'gt',threshold:20}).matches.length,0);
});
