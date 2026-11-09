import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewIrrigatedWorld,createNewWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {advanceGeneratedFacilityReview} from '../dist/story/generated-facility-review.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';
import {createGeneratedSaveDraft} from '../dist/story/generated-save-draft-review.js';
import {generatedSession,advanceWorldSession,saveWorldSession,improveWorldGrowth} from '../dist/story/world-session.js';
import {ownProductionWorld,validateProductionWorld,validateProductionWorldAsync} from '../dist/irrigation/production-history-v1.js';
import {introduceProductionIrrigation,advanceProductionEnvironment,slowProductionClimate} from '../dist/irrigation/production-progression-v1.js';
import {createCoupledReview,advanceCoupledReview,chooseCoupledReview,coupledDecisionFingerprint,chooseCommonCoupledReviews} from '../dist/irrigation/coupled-progression-v1.js';
import {economyEffectReader} from '../dist/irrigation/economy-model-v1.js';
import {regionalHarvestFactors,updateRegionalEconomy} from '../dist/story/regional-economy.js';
import {regions} from '../dist/story/population.js';
import {step} from '../dist/story/engine.js';
import {coupledAnnualModifier} from '../dist/story/coupled-economy-policy-internal.js';
const initial=createNewIrrigatedWorld(42).review,save=createGeneratedWorldSave(initial);
const plain=w=>{const {trialBoundary,...review}=w.review;return {...w,format:'generated-bridge-review',review};};

function replay(before,receipt,seed){
 const e=structuredClone(before),row=receipt.input,people=[...row[0]],factors=regionalHarvestFactors(receipt.year,seed,row[1]);
 factors[0]*=1+(receipt.gainBp-receipt.costBp)/10000;let n=0;
 const totals=updateRegionalEconomy(e,people,receipt.year,{harvestFactors:factors,blockedRegions:new Set(regions.filter((_,i)=>row[2]&(1<<i)).map(r=>r.id)),...(row[4]?{disruptionId:row[4]}:{}),...(row[3]>=0?{granaries:regions.map((_,i)=>!!(row[3]&(1<<i)))}:{})},()=>row[5][n++]);
 assert.equal(n,row[5].length);return {e,people,totals};
}

test('four isolated policies share one origin and baseline reproduces B with annual receipts',async()=>{
 const roots=await Promise.all(['baseline','yield-only','cost-only','combined'].map(p=>createCoupledReview(save,p)));
 assert.equal(new Set(roots.map(r=>r.originHash)).size,1);
 for(const r of roots){assert.ok(Object.isFrozen(r.world.review.state));assert.equal(r.world.review.trialBoundary,r.format);assert.equal(r.receipts.length,0);}
 const a=advanceCoupledReview(roots[0],1000),b=advanceGeneratedBridgeReview(restoreGeneratedWorld(save),1000,'automatic');
 assert.deepEqual(plain(a.world),b);assert.equal(a.receipts.length,1000);assert.deepEqual(a.receipts.map(r=>r.year),Array.from({length:1000},(_,i)=>i+1));
 assert.ok(a.receipts.every(r=>r.gainBp===0&&r.costBp===0));assert.ok(roots.slice(1).every(r=>r.world.review.state.year===0));
 assert.deepEqual(advanceCoupledReview(advanceCoupledReview(roots[0],575),425),a);
});

test('first effect equals C1 exactly and actual branch reserves/people carry into the next year',async()=>{
 const b=advanceGeneratedBridgeReview(initial,700,'automatic'),effect=economyEffectReader(b,0)(576),at575=advanceGeneratedBridgeReview(initial,575,'automatic');
 for(const policy of ['baseline','yield-only','cost-only','combined']){
  const root=await createCoupledReview(save,policy),a=advanceCoupledReview(root,576),receipt=a.receipts.at(-1);
  assert.deepEqual(receipt.effect,effect);assert.equal(receipt.gainBp,['yield-only','combined'].includes(policy)?effect.gainBp:0);assert.equal(receipt.costBp,['cost-only','combined'].includes(policy)?effect.costBp:0);
  const expected=replay(at575.review.state.economy,receipt,42);assert.deepEqual(receipt.harvest,expected.totals.harvest);assert.deepEqual(a.world.review.state.economy,expected.e);assert.deepEqual(a.world.review.state.observation.people,expected.people);
  const next=advanceCoupledReview(a,1),r=next.receipts.at(-1),carried=replay(a.world.review.state.economy,r,42);
  assert.deepEqual(next.world.review.state.economy,carried.e);assert.deepEqual(r.harvest,carried.totals.harvest);
  assert.deepEqual(advanceCoupledReview(root,577),next);
  // Surplus can hit the reserve cap: a harvest difference need not persist.
 }
});

test('pending is prepared but unapplied; zero/stop calls preserve it and choice commits exactly once',async()=>{
 const root=await createCoupledReview(save,'combined'),held=advanceCoupledReview(root,1000,'stop'),year=held.world.review.state.year;
 assert.ok(held.world.review.state.pending);assert.equal(held.receipts.length,year-1);assert.equal(held.prepared.modifier.year,year);assert.equal(held.prepared.effect.sourceYear,year-1);
 assert.equal(advanceCoupledReview(held,0),held);assert.deepEqual(advanceCoupledReview(held,20,'stop'),held);
 const chosen=chooseCoupledReview(held,'random');assert.equal(chosen.receipts.length,year);assert.equal(chosen.confirmedThrough,year);assert.equal(chosen.prepared,null);assert.equal(chosen.phases.at(-1).draws,1);
 assert.throws(()=>chooseCoupledReview(chosen,'random'));
 const pendingB=advanceGeneratedBridgeReview(initial,1000,'stop'),origin=await createCoupledReview(createGeneratedWorldSave(pendingB),'baseline');
 assert.equal(origin.originPending,true);assert.equal(advanceCoupledReview(origin,0).receipts.length,0);
 const resumed=chooseCoupledReview(origin,'random');assert.deepEqual(plain(resumed.world).review.state,chooseAutomaticallyGeneratedBridgeReview(pendingB).review.state);assert.equal(resumed.receipts.length,1);
});

test('explicit synthetic low-reserve origin carries economic differences instead of resetting to B',async()=>{
 const origin=advanceGeneratedBridgeReview(initial,575,'automatic'),fixture=structuredClone(createGeneratedWorldSave(origin));
 fixture.state.economy.districts[0].reserve=0; // Controlled initial economic state, never a natural audit case.
 const root=await createCoupledReview(fixture,'combined'),first=advanceCoupledReview(root,1),second=advanceCoupledReview(first,1);
 const expected=replay(first.world.review.state.economy,second.receipts.at(-1),42);
 assert.deepEqual(second.world.review.state.economy,expected.e);
 const baselineFirst=advanceCoupledReview(await createCoupledReview(fixture,'baseline'),1);
 assert.notDeepEqual(first.world.review.state.economy,baselineFirst.world.review.state.economy);
 assert.deepEqual(second.receipts.at(-1).discarded,expected.totals.discarded);
 const incorrectlyReset=replay(baselineFirst.world.review.state.economy,second.receipts.at(-1),42);
 assert.notDeepEqual(second.receipts.at(-1).discarded,incorrectlyReset.totals.discarded);
});

test('explicit choices bind complete versioned decision content and consume no RNG',async()=>{
 const roots=await Promise.all(['baseline','combined'].map(p=>createCoupledReview(save,p,'common-explicit-v1'))),held=roots.map(r=>advanceCoupledReview(r,1000,'stop'));
 const key=coupledDecisionFingerprint(held[0]);assert.equal(coupledDecisionFingerprint(held[1]),key);
 const common=chooseCommonCoupledReviews(held,0);assert.ok(common.every(r=>r.phases.at(-1).draws===0));
 assert.ok(common.every(r=>r.phases.at(-1).choice.index===0&&r.phases.at(-1).choice.fingerprint===key));
 const before=JSON.stringify(held);assert.throws(()=>chooseCommonCoupledReviews([held[0],common[1]],0));assert.equal(JSON.stringify(held),before);
 for(const r of held){assert.throws(()=>chooseCoupledReview(r,0,key+'changed'));assert.throws(()=>chooseCoupledReview(r,'random'));assert.throws(()=>advanceCoupledReview(r,1,'automatic'));
  const chosen=chooseCoupledReview(r,0,key);assert.equal(chosen.phases.at(-1).draws,0);assert.equal(chosen.receipts.length,r.receipts.length+1);}
 assert.throws(()=>chooseCoupledReview(advanceCoupledReview(roots[0],0),0,key));
});

test('C2 shapes, clones and production-shaped adapters fail every production boundary',async()=>{
 const trial=advanceCoupledReview(await createCoupledReview(save,'combined'),600),before=JSON.stringify(trial);
 for(const world of [trial.world,structuredClone(trial.world),{...structuredClone(trial.world),format:'generated-bridge-review'}]){
  for(const factory of [generatedSession,createGeneratedWorldSave,createGeneratedSaveDraft,ownProductionWorld,validateProductionWorld,introduceProductionIrrigation,advanceProductionEnvironment,slowProductionClimate])assert.throws(()=>factory(world),/Coupled trial/);
  await assert.rejects(()=>validateProductionWorldAsync(world),/Coupled trial/);
  assert.throws(()=>advanceGeneratedBridgeReview(world,0),/Coupled trial/);assert.throws(()=>advanceGeneratedFacilityReview(world.review,0),/Coupled trial/);
  const fake={mode:'generated',review:world,state:world.review.state};for(const f of [s=>advanceWorldSession(s,0),saveWorldSession,improveWorldGrowth])assert.throws(()=>f(fake),/Coupled trial/);
 }
 assert.throws(()=>advanceCoupledReview(structuredClone(trial),1),/owned/);assert.equal(JSON.stringify(trial),before);
 await assert.rejects(()=>createCoupledReview(createGeneratedWorldSave(createNewWorld(42).review),'combined'));
 assert.throws(()=>advanceGeneratedBridgeReview(initial,1,'automatic',{coupledEconomy:()=>({gainBp:100})}),/Unknown/);
});

test('mid-history adoption does not retrocharge construction and invalid engine coefficients are atomic to callers',async()=>{
 const origin=advanceGeneratedBridgeReview(initial,575,'automatic'),root=await createCoupledReview(createGeneratedWorldSave(origin),'combined'),a=advanceCoupledReview(root,1);
 assert.equal(a.receipts[0].effect.workEventIds.length,0);assert.ok(a.receipts[0].effect.costBp<economyEffectReader(advanceGeneratedBridgeReview(initial,576,'automatic'),0)(576).costBp);
 const before=JSON.stringify(root);for(const years of [-1,1.5,10001])assert.throws(()=>advanceCoupledReview(root,years));assert.equal(JSON.stringify(root),before);
 const effect=a.receipts[0].effect,modifier=coupledAnnualModifier(576,'combined',effect);
 assert.throws(()=>coupledAnnualModifier(577,'combined',effect));
 for(const bad of [{...modifier,year:2},{...modifier,sourceYear:0},{...modifier,costBp:301},{...modifier,gainBp:101}]){
  const s=structuredClone(initial.review.state);assert.throws(()=>step(s,{mode:'irrigation-coupled-review-only',coupledEconomy:()=>Object.freeze(bad),placeFacility:()=>({status:'hold'}),afterFacilities:()=>{}}),/modifier/);
 }
});
