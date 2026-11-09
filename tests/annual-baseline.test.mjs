import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewWorld,createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {annualLandSources} from '../dist/environment/annual-land-sources-internal.js';
import {landUseEvents,irrigationEnvironmentRunner} from '../dist/environment/model-v1.js';
import {vegetationSourceEvents} from '../dist/vegetation/history-v1.js';
import {irrigationSourcesFromWorld,incrementalIrrigationSources} from '../dist/irrigation/sources-v1.js';
import {advanceAnnualBaseline,chooseAnnualBaseline} from '../dist/irrigation/annual-baseline-internal.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {validateProductionWorld} from '../dist/irrigation/production-history-v1.js';
import {introduceProductionIrrigation,slowProductionClimate} from '../dist/irrigation/production-progression-v1.js';
import {createEnvironment} from '../dist/environment/progression-v1.js';

const initial=createNewIrrigatedWorld(42).review;
test('annual cursors reproduce full-prefix land/vegetation order and irrigation sources without reading ahead',()=>{
 for(const seed of [1,21,29,42,198]){
  const full=advanceGeneratedBridgeReview(seed===42?initial:createNewIrrigatedWorld(seed).review,1000,'automatic');
  const copy=structuredClone({...full.review,terrain:null}),review={...copy,terrain:full.review.terrain,bridgeReview:{...copy.bridgeReview,hydrology:full.review.bridgeReview.hydrology}},world={...full,review},cursor=annualLandSources(review),index=incrementalIrrigationSources(world),uses=[],events=[];
  for(let year=0;year<=1000;year++){
   review.state.observation.lastYear=year;
   const delta=cursor.take();assert.equal(delta.through,year);assert.ok(delta.uses.every(e=>e.year===year));assert.ok(delta.events.every(e=>e.year===year));
   uses.push(...delta.uses);events.push(...delta.events);index.append(delta);
   if([0,1,99,100,574,575,615,675,1000].includes(year)){
    assert.deepEqual(uses,landUseEvents(review),seed+'/'+year+'/land');assert.deepEqual(events,vegetationSourceEvents(review),seed+'/'+year+'/vegetation');
    const oracle=irrigationSourcesFromWorld({...world,environment:{...world.environment,confirmedThrough:year}});
    assert.deepEqual(index.source.changed(year),oracle.changed(year));assert.deepEqual(index.source.causes.get(year),oracle.causes.get(year));
    assert.equal(index.source.keyAt(year),oracle.keyAt(year));assert.deepEqual(index.source.at(year),oracle.at(year));
   }
  }
  assert.deepEqual(cursor.take().uses,[]);assert.deepEqual(cursor.take().events,[]);
  assert.throws(()=>index.source.at(1001));review.state.observation.lastYear=0;assert.throws(()=>cursor.take());
 }
});

test('annual ecology commits before the next phase and exactly matches B including cold replay',()=>{
 const before=JSON.stringify(initial),a=advanceAnnualBaseline(initial,700),b=advanceGeneratedBridgeReview(initial,700,'automatic');
 assert.deepEqual(a.world,b);assert.equal(a.diagnostics.ecologySteps,700);assert.equal(JSON.stringify(initial),before);
 for(const p of a.diagnostics.phases){assert.equal(p.ecologyBefore,p.confirmedBefore);assert.equal(p.ecologyAfter,p.confirmedAfter);assert.ok(Object.isFrozen(p));}
 assert.deepEqual(validateProductionWorld(structuredClone(a.world)),a.world);
});

test('unaligned origins, construction/damage/backfill and split continuation keep exact B values',()=>{
 const b=advanceGeneratedBridgeReview(initial,700,'automatic');
 for(const year of [0,99,100,237,574,575,614,615,674,675]){
  const origin=advanceGeneratedBridgeReview(initial,year,'automatic');
  const a=advanceAnnualBaseline(origin,700-year).world;assert.deepEqual(a,b,'origin '+year);
 }
 const split=advanceAnnualBaseline(advanceAnnualBaseline(initial,575).world,125).world;assert.deepEqual(split,b);
});

test('pending/zero-year boundaries, manual/automatic choices and gzip resume apply ecology once',async()=>{
 const a=advanceAnnualBaseline(initial,1000,'stop'),b=advanceGeneratedBridgeReview(initial,1000,'stop');assert.deepEqual(a.world,b);
 assert.ok(a.world.review.state.pending);const confirmed=b.environment.confirmedThrough;
 assert.equal(a.diagnostics.ecologySteps,confirmed);assert.equal(a.diagnostics.phases.at(-1).ecologyAfter,confirmed);
 for(const [years,mode]of [[0,'stop'],[0,'automatic'],[100,'stop']]){
  const held=advanceAnnualBaseline(a.world,years,mode);assert.deepEqual(held.world,a.world);assert.equal(held.diagnostics.ecologySteps,0);assert.equal(held.diagnostics.phases.length,0);
 }
 const wire=await encodeWorldSave(createGeneratedWorldSave(a.world)),loaded=restoreGeneratedWorld(await decodeWorldSave(wire.json));
 for(const index of [0,'random']){
  const chosen=chooseAnnualBaseline(loaded,index),normal=index==='random'?chooseAutomaticallyGeneratedBridgeReview(b):chooseGeneratedBridgeReview(b,index);
  // B's storage deliberately resets non-persisted placement diagnostics.
  assert.deepEqual(createGeneratedWorldSave(chosen.world),createGeneratedWorldSave(normal));assert.equal(chosen.diagnostics.ecologySteps,1);assert.equal(chosen.diagnostics.phases[0].draws,index==='random'?1:0);
  assert.deepEqual(createGeneratedWorldSave(advanceAnnualBaseline(chosen.world,100).world),createGeneratedWorldSave(advanceGeneratedBridgeReview(normal,100,'automatic')));
 }
 assert.deepEqual(createGeneratedWorldSave(advanceAnnualBaseline(loaded,1).world),createGeneratedWorldSave(advanceGeneratedBridgeReview(b,1,'automatic')));
});

test('mid-history irrigation adoption and future-only slow climate retain original checkpoint boundaries',()=>{
 const d2=createNewWorld(42).review,fast={...d2,environment:createEnvironment(d2.vegetation,d2.review,false)};
 for(const year of [99,237]){
  const adopted=introduceProductionIrrigation(advanceGeneratedBridgeReview(fast,year,'automatic'));
  for(const origin of [adopted,slowProductionClimate(adopted)]){
   const a=advanceAnnualBaseline(origin,700-year).world,b=advanceGeneratedBridgeReview(origin,700-year,'automatic');
   assert.deepEqual(a,b);assert.deepEqual(validateProductionWorld(structuredClone(a)),a);
  }
 }
});

test('invalid annual deltas and failing/invalid calls preserve caller data',()=>{
 const e=initial.environment,v=initial.vegetation,r=irrigationEnvironmentRunner(v,initial.review,e.uses,e.current,()=>({moisture:[],occupiedPatches:[],disturbedPatches:[]}));
 const before=r.snapshot(),future={...e.uses[0],year:2};assert.throws(()=>r.append([future],[]));assert.deepEqual(r.snapshot(),before);
 r.append([],[]);assert.throws(()=>r.append([],[]));r.step(e.targets[0],true);
 const original=JSON.stringify(initial);
 assert.throws(()=>advanceAnnualBaseline(initial,20,'automatic',{observeEconomy:()=>{throw Error('observer failed');}}),/observer failed/);
 for(const years of [-1,1.5,10001])assert.throws(()=>advanceAnnualBaseline(initial,years));
 assert.throws(()=>advanceAnnualBaseline(initial,1,'bad'));assert.throws(()=>advanceAnnualBaseline(initial,1,'stop',{stopAtNewRecord:'bad'}));
 assert.throws(()=>chooseAnnualBaseline(initial,0));assert.throws(()=>advanceAnnualBaseline(createNewWorld(42).review,1));
 assert.equal(JSON.stringify(initial),original);
 assert.deepEqual(advanceAnnualBaseline(initial,100,'automatic',{stopAtNewRecord:true}).world,advanceGeneratedBridgeReview(initial,100,'automatic',{stopAtNewRecord:true}));
});
