import {test} from 'node:test';import assert from 'node:assert/strict';
import {gpsFix,navigationTo,startGps,validCoordinate} from './gps-navigation.js';
test('GPS calculations handle cardinal directions, antimeridian, coincident points and invalid coordinates',()=>{
 const n=navigationTo({latitude:0,longitude:0},{latitude:1,longitude:0});assert.ok(Math.abs(n.distance-111195)<2);assert.equal(n.bearing,0);
 assert.equal(navigationTo({latitude:0,longitude:0},{latitude:0,longitude:1}).bearing,90);
 assert.ok(navigationTo({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9}).distance<23000);
 assert.equal(navigationTo({latitude:1,longitude:1},{latitude:1,longitude:1}).bearing,null);
 assert.equal(validCoordinate(91,0),false);assert.throws(()=>gpsFix({coords:{latitude:0,longitude:0,accuracy:-1},timestamp:1}));
 const fix=gpsFix({coords:{latitude:0,longitude:0,accuracy:3,heading:0,speed:0,altitude:null},timestamp:1});assert.equal(fix.heading,0);assert.equal(fix.speed,0);assert.equal(fix.altitude,null);
});
test('watch lifecycle requests accurate foreground fixes and drops late callbacks after stop',()=>{
 let success,fail,cleared;const fixes=[],errors=[];
 const stop=startGps({watchPosition(s,e,options){success=s;fail=e;assert.equal(options.enableHighAccuracy,true);return 7;},clearWatch(id){cleared=id;}},f=>fixes.push(f),e=>errors.push(e));
 success({coords:{latitude:1,longitude:2,accuracy:5},timestamp:10});assert.equal(fixes.length,1);fail({code:1});assert.match(errors[0],/permission/);stop();assert.equal(cleared,7);success({coords:{latitude:1,longitude:2,accuracy:5},timestamp:20});assert.equal(fixes.length,1);
});
