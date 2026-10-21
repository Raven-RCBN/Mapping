import {test} from 'node:test';import assert from 'node:assert/strict';
import {productionTonnes,productionYield,forecastYield} from './production-tonnage.js';
test('yield adds block loose fruit exactly once and never trusts a stale cached total',()=>{
 const r={receiptStatus:'received',mt:100,ffbMt:100,looseFruitMt:5,totalCropMt:999,effectiveHa:10};
 assert.deepEqual(productionTonnes(r),{ffbMt:100,looseFruitMt:5,totalCropMt:105});assert.equal(productionYield(r),10.5);assert.equal(r.totalCropMt,999);
 assert.equal(productionTonnes({...r,mt:110}).ffbMt,110);
});
test('legacy FFB records, zero, unavailable production and invalid hectares stay distinct',()=>{
 assert.equal(productionYield({receiptStatus:'received',mt:10,effectiveHa:2}),5);
 assert.equal(productionTonnes({mt:10}).looseFruitMt,null);
 assert.equal(productionYield({receiptStatus:'received',mt:0,looseFruitMt:0,effectiveHa:2}),0);
 for(const effectiveHa of [null,0,-1,NaN])assert.equal(productionYield({receiptStatus:'received',mt:10,looseFruitMt:5,effectiveHa}),null);
 assert.equal(productionYield({receiptStatus:'not_received',mt:0,looseFruitMt:0,effectiveHa:1}),null);
 assert.equal(productionYield({receiptStatus:'received',mt:null,looseFruitMt:5,effectiveHa:1}),null);
 assert.equal(forecastYield(100,10,'ffb_plus_loose_fruit'),10);assert.equal(forecastYield(100,10,undefined),null);
});
