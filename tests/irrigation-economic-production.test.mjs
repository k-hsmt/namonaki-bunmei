import test from 'node:test';import assert from 'node:assert/strict';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {generatedSession} from '../dist/story/world-session.js';
import {createCoupledReview,advanceCoupledReview} from '../dist/irrigation/coupled-progression-v1.js';
import {introduceEconomicProduction,createEconomicProductionFromSave,advanceEconomicProductionWorld,chooseEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {economicProductionViewInternal} from '../dist/irrigation/economic-production-view-internal.js';
import {ownProductionWorld} from '../dist/irrigation/production-history-v1.js';
const initial=createNewIrrigatedWorld(42).review,save=createGeneratedWorldSave(initial);
const semantic=w=>{const {trialBoundary,economicPolicyBoundary,...review}=w.review;return {...w,format:'generated-bridge-review',status:'review-only',review};};
test('production annual economics match C2 combined without acquiring trial or B ownership',async()=>{
 const root=await introduceEconomicProduction(initial),next=advanceEconomicProductionWorld(root,700,'automatic'),trial=advanceCoupledReview(await createCoupledReview(save,'combined'),700);
 assert.deepEqual(semantic(economicProductionViewInternal(next)),semantic(trial.world));assert.deepEqual(next.economicCoupling.receipts,trial.receipts);assert.deepEqual(next.economicCoupling.phases,trial.phases);
 assert.equal(root.economicCoupling.receipts.length,0);assert.equal(await introduceEconomicProduction(root),root);
 assert.deepEqual(advanceEconomicProductionWorld(advanceEconomicProductionWorld(root,575,'automatic'),125,'automatic'),next);
 for(const value of [next,structuredClone(next),economicProductionViewInternal(next)])for(const factory of [generatedSession,createGeneratedWorldSave,ownProductionWorld])assert.throws(()=>factory(value),/Economic production/);
 assert.throws(()=>advanceEconomicProductionWorld(structuredClone(next),1),/owned/);
});
test('pending effects commit once for manual and automatic choices, and stale choices are atomic',async()=>{
 const root=await createEconomicProductionFromSave(save),pending=advanceEconomicProductionWorld(root,1000,'stop');
 assert.ok(pending.review.state.pending);assert.equal(pending.economicCoupling.receipts.length,pending.review.state.year-1);assert.equal(advanceEconomicProductionWorld(pending,0),pending);
 assert.throws(()=>chooseEconomicProductionWorld(pending,0,'stale'),/stale/);
 const manual=chooseEconomicProductionWorld(pending,0),automatic=chooseEconomicProductionWorld(pending,'random');
 assert.equal(manual.economicCoupling.phases.at(-1).draws,0);assert.equal(automatic.economicCoupling.phases.at(-1).draws,1);assert.equal(manual.economicCoupling.prepared,null);
 assert.equal(manual.economicCoupling.receipts.length,pending.economicCoupling.receipts.length+1);
 assert.throws(()=>chooseEconomicProductionWorld(manual,0),/Missing/);
 const mixed=advanceEconomicProductionWorld(manual,100,'automatic');assert.ok(mixed.economicCoupling.phases.some(p=>p.phase==='manual-choice'));assert.deepEqual(advanceEconomicProductionWorld(advanceEconomicProductionWorld(manual,25,'automatic'),75,'automatic'),mixed);
});
test('introduction preserves a confirmed prefix and rejects a pending source or a trial origin',async()=>{
 const past=advanceGeneratedBridgeReview(initial,575,'automatic'),root=await introduceEconomicProduction(past);
 assert.equal(root.economicCoupling.introducedYear,575);assert.deepEqual(semantic(economicProductionViewInternal(root)),past);
 assert.equal(advanceEconomicProductionWorld(root,1,'automatic').economicCoupling.receipts[0].effect.sourceYear,575);
 const pending=advanceGeneratedBridgeReview(initial,1000,'stop');await assert.rejects(()=>introduceEconomicProduction(pending),/confirmed/);
 const trial=await createCoupledReview(save,'combined');await assert.rejects(()=>introduceEconomicProduction(trial.world),/Coupled trial/);
});
