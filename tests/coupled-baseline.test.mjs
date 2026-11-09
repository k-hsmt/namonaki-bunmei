import test from 'node:test';
import assert from 'node:assert/strict';
import {SeededRng} from '../dist/engine/rng.js';
import {createNewIrrigatedWorld,createNewWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {auditBaselineAdvance,boundedRngDraws} from '../dist/irrigation/coupled-baseline-audit-v1.js';
import {advanceGeneratedFacilityReview} from '../dist/story/generated-facility-review.js';
import {advanceGeneratedFacilityReview as internalAdvance} from '../dist/story/generated-facility-batch-internal.js';
import {generatedPublicSpaceExtension} from '../dist/story/generated-public-space-review.js';

test('bounded RNG diagnostics agree with actual draws, including unsigned wrap',()=>{
 for(const seed of [0,1,42,0xffffffff])for(const n of [0,1,6,64,4096]){
  const rng=new SeededRng(seed);for(let i=0;i<n;i++)rng.next();
  assert.equal(boundedRngDraws(seed,rng.state,4096),n);
 }
 const rng=new SeededRng(42);for(let i=0;i<4097;i++)rng.next();
 assert.throws(()=>boundedRngDraws(42,rng.state,4096));
 for(const args of [[-1,0,64],[0,2**32,64],[0,0,4097],[0,0,1.5]])assert.throws(()=>boundedRngDraws(...args));
});

test('annual receipts cover commits once, after step has saved RNG; neutral world equals B',()=>{
 const origin=createNewIrrigatedWorld(42).review,before=JSON.stringify(origin);
 const {world,diagnostics:d}=auditBaselineAdvance(origin,700);
 assert.deepEqual(createGeneratedWorldSave(world),createGeneratedWorldSave(advanceGeneratedBridgeReview(origin,700,'automatic')));
 assert.equal(JSON.stringify(origin),before);
 assert.equal(d.phases.filter(p=>p.confirmedAfter>p.confirmedBefore).length,700);
 assert.deepEqual(d.phases.filter(p=>p.confirmedAfter>p.confirmedBefore).map(p=>p.confirmedAfter),Array.from({length:700},(_,i)=>i+1));
 assert.equal(d.phases[0].rngBefore,origin.review.state.rngState);
 assert.equal(d.phases.at(-1).rngAfter,world.review.state.rngState);
 for(let i=1;i<d.phases.length;i++)assert.equal(d.phases[i-1].rngAfter,d.phases[i].rngBefore);
 assert.equal(d.totalDraws,d.phases.reduce((s,p)=>s+p.draws,0));
 assert.ok(d.phases.some(p=>p.pending));assert.ok(d.phases.some(p=>p.phase==='automatic-choice'));
 assert.ok(Object.isFrozen(d.phases[0]));assert.throws(()=>{d.phases[0].year=9999;});
});

test('pending and zero-year origins preserve B boundaries; imported draws remain unknown',()=>{
 const origin=createNewIrrigatedWorld(42).review;
 const stopped=auditBaselineAdvance(origin,1000,'stop');
 assert.ok(stopped.world.review.state.pending);
 const last=stopped.diagnostics.phases.at(-1);
 assert.equal(last.confirmedBefore,last.confirmedAfter);assert.equal(last.pending,true);
 for(const years of [0,20]){
  const held=auditBaselineAdvance(stopped.world,years,'stop');
  assert.deepEqual(held.world,stopped.world);assert.equal(held.diagnostics.phases.length,0);
  assert.equal(held.diagnostics.originPending,true);assert.equal(held.diagnostics.originPendingStepDraws,null);
 }
 const zero=auditBaselineAdvance(stopped.world,0,'automatic');assert.equal(zero.diagnostics.phases.length,0);
 const resumed=auditBaselineAdvance(stopped.world,1);
 assert.equal(resumed.diagnostics.phases[0].phase,'automatic-choice');
 assert.equal(resumed.diagnostics.phases[0].draws,1);
 assert.deepEqual(resumed.world,advanceGeneratedBridgeReview(stopped.world,1,'automatic'));
 const manual=chooseGeneratedBridgeReview(stopped.world,0),next=auditBaselineAdvance(manual,10);
 assert.deepEqual(next.world,advanceGeneratedBridgeReview(manual,10,'automatic'));
});

test('introduced and split batches preserve full ecology, irrigation, population and land',()=>{
 const origin=createNewIrrigatedWorld(42).review;
 for(const year of [0,99,100,575]){
  const start=advanceGeneratedBridgeReview(origin,year,'automatic');
  const split=auditBaselineAdvance(auditBaselineAdvance(start,23).world,41).world;
  const whole=advanceGeneratedBridgeReview(start,64,'automatic');
  assert.deepEqual(createGeneratedWorldSave(split),createGeneratedWorldSave(whole),'origin '+year);
 }
 assert.throws(()=>auditBaselineAdvance(createNewWorld(42).review,1));
 for(const years of [-1,1.5,10001])assert.throws(()=>auditBaselineAdvance(origin,years));
});

test('stop-at-record contract is unchanged; throwing an internal tap leaves caller untouched',()=>{
 const origin=createNewIrrigatedWorld(42).review,before=JSON.stringify(origin);
 const options={stopAtNewRecord:true};
 assert.deepEqual(auditBaselineAdvance(origin,100,'automatic',options).world,advanceGeneratedBridgeReview(origin,100,'automatic',options));
 let calls=0;
 assert.throws(()=>internalAdvance(origin.review,100,'automatic',generatedPublicSpaceExtension,{},()=>{calls++;throw Error('tap failure');}),/tap failure/);
 assert.equal(calls,1);assert.equal(JSON.stringify(origin),before);
 assert.deepEqual(advanceGeneratedFacilityReview(origin.review,0),origin.review);
});
