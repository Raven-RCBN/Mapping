import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBlockFeatures,selectionStyles} from '../ui/map-selection.js';

const feature=(code,geometry)=>({type:'Feature',properties:{blockName:code},geometry});
const polygon={type:'MultiPolygon',coordinates:[[[[1,1],[3,1],[3,3],[1,1]]],[[[5,5],[6,5],[6,6],[5,5]]]]};
const a=feature('A1',polygon),b=feature('A10',{type:'Polygon',coordinates:[[[7,7],[8,7],[8,8],[7,7]]]}),c=feature('B2',polygon);
const estate={type:'FeatureCollection',features:[a,b,c]};

test('analytics outlines only exact block matches, not similarly named neighbours',()=>{
 assert.deepEqual(selectBlockFeatures(estate,'',['A1']),[a]);
});
test('selected and analytical blocks share their exact original multipart geometry',()=>{
 const result=selectBlockFeatures(estate,'A10',['A1','A1','unknown']);
 assert.deepEqual(result,[a,b]);
 assert.equal(result[0].geometry,polygon);
 assert.equal(result[1].geometry,b.geometry);
 assert.deepEqual(estate.features,[a,b,c]);
});
test('clearing selection removes every outline',()=>{
 assert.deepEqual(selectBlockFeatures(estate,'',[]),[]);
});
test('boundary remains legible on imagery through blue stroke and wider white casing',()=>{
 assert.equal(selectionStyles[0].getStroke().getColor(),'#ffffff');
 assert.equal(selectionStyles[1].getStroke().getColor(),'#006bff');
 assert.ok(selectionStyles[0].getStroke().getWidth()>selectionStyles[1].getStroke().getWidth());
 assert.equal(selectionStyles[1].getFill().getColor(),'rgba(0,107,255,0.04)');
});
