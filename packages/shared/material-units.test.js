import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeMaterialIssue,materialPackSize} from './material-units.js';
test('pack count policy overrides legacy GM, ML, MT and KG issue labels with the explicit size',()=>{
 for(const [product,unit,qty,expected,target]of [['FERT (500KG)','BAG',2,1000,'KG'],['BM CERGAS (500 GMS)','GM',14500,7250,'KG'],['MIRACLE S240 (500 ML)','ML',1360,680,'L'],['FERT (750KG)','MT',1.2,900,'KG'],['GARLON (4L)','LIT',3,12,'L'],['FERT (300kg)','KG',2,600,'KG']]){const r=normalizeMaterialIssue({product,unit,netQuantity:qty});assert.equal(r.normalizedQuantity,expected);assert.equal(r.normalizedUnit,target);assert.equal(r.normalizationStatus,'converted');}
});
test('unit descriptions, multipacks, zero and net quantities convert once without guessing bare pack sizes',()=>{
 assert.equal(normalizeMaterialIssue({product:'Product',netQuantity:2},{unitDescription:'500 KG'}).normalizedQuantity,1000);
 assert.equal(normalizeMaterialIssue({product:'2 x 500 ML',netQuantity:3}).normalizedQuantity,3);
 assert.equal(normalizeMaterialIssue({product:'Pack 50KG',netQuantity:0}).normalizedQuantity,0);
 for(const product of ['ANSAR 550','CHOPPER 100','FERT 12/3/23+0.7%B'])assert.equal(normalizeMaterialIssue({product,unit:'BAG',netQuantity:20}).normalizedQuantity,null);
 assert.equal(materialPackSize({product:'50KG',unitDescription:'500 KG'}).normalizationStatus,'conflicting_pack_size');
 const row={product:'50KG',unit:'BAG',netQuantity:8};const a=normalizeMaterialIssue(row);assert.equal(normalizeMaterialIssue({...row,...a}).normalizedQuantity,400);assert.equal(row.netQuantity,8);
});

test('no pack size uses the issued quantity with standard unit conversion, retaining unknown count units',()=>{
 assert.equal(normalizeMaterialIssue({product:'ANSAR 550',unit:'LIT',netQuantity:20}).normalizedQuantity,20);
 assert.equal(normalizeMaterialIssue({product:'Bulk',unit:'MT',netQuantity:2}).normalizedQuantity,2000);
 assert.equal(normalizeMaterialIssue({product:'Bulk',unit:'GM',netQuantity:2000}).normalizedQuantity,2);
 assert.equal(normalizeMaterialIssue({product:'Unknown bag',unit:'BAG',netQuantity:20}).normalizationStatus,'source_quantity');
});
