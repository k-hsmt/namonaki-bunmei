import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {irrigationSourcesFromWorld} from '../dist/irrigation/sources-v1.js';
import {kernelGeometry} from '../dist/irrigation/production-types-v1.js';
import {irrigationWettedCells,patchIndex} from '../dist/irrigation/ecology-v1.js';
import {economyEffectCalculator,economyGainBp} from '../dist/irrigation/economy-effect-core-v1.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {waterBuffers,moistureAt} from '../dist/environment/model-v1.js';

test('cached field geometry preserves cell sums while climate, soil, missing patches and occupation change',()=>{
 const world=advanceGeneratedBridgeReview(createNewIrrigatedWorld(42).review,700,'automatic');
 const system={...world.irrigation.systems[0],geometry:kernelGeometry(world.irrigation.systems[0].geometry)};
 let frame=irrigationSourcesFromWorld(world).at(575),key='original',humidity=-80,soil=-30,missing=false;
 assert.ok(frame.fields.some(f=>f.id===system.geometry.field.id));
 const r=readOwnedRecordPhysics(world.review.terrain.sites['river-bank'].physics),buffer=waterBuffers(world.review,'river-bank');
 const patchAt=()=>missing?null:[0,0,soil];
 const calculate=economyEffectCalculator(world.review,{at:()=>frame,keyAt:()=>key},{channelAt:()=>({id:system.id,status:'active'}),system:()=>system,eventsAt:()=>[],environmentAt:()=>({humidity,patchAt})},0);
 // The original uncached, row-major cell calculation is the reference.
 const reference=()=>{
  const wet=irrigationWettedCells(system,frame),p=system.geometry.field.plot;let wetCells=0,fieldCells=0,total=0,known=true;
  for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){
   const i=y*320+x;if(r.surface[i]!==1||r.bearing[i]!==0)continue;
   fieldCells++;wetCells+=wet[i];const index=patchIndex(x,y),patch=patchAt(index);
   if(!patch)known=false;else total+=moistureAt(humidity,buffer[index],patch[2]);
  }
  const moisture=known&&fieldCells?total/fieldCells:null;
  return {wetCells,fieldCells,moisture,gainBp:economyGainBp(wetCells,fieldCells,moisture,frame.fields.length)};
 };
 let year=576;
 const check=()=>{const actual=calculate(year++),expected=reference();for(const name of Object.keys(expected))assert.equal(actual[name],expected[name],name);return actual;};
 const first=check();assert.ok(first.wetCells>0);
 humidity=-20;soil=70;assert.notEqual(check().moisture,first.moisture);
 humidity=40;soil=0;check();missing=true;assert.equal(check().moisture,null);missing=false;check();
 frame={...frame,ground:{...frame.ground,occupancy:[...frame.ground.occupancy,{id:'test-blocker',kind:'house',plot:system.geometry.field.plot}]}};key='new-occupation';
 assert.equal(check().wetCells,0);
});
