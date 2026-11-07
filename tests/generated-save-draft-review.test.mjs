import test from 'node:test';import assert from 'node:assert/strict';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';
import {createGeneratedBridgeReview,advanceGeneratedBridgeReview,chooseGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createGeneratedSaveDraft,parseGeneratedSaveDraft,serializeGeneratedSaveDraft,restoreGeneratedSaveDraft,validateGeneratedSaveDraft} from '../dist/story/generated-save-draft-review.js';
import {findReviewSaveDraft,storeReviewSaveDraft,REVIEW_V5_SAVE_KEY} from '../dist/story/save-draft-dispatch-review.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';import {validateHousingSave} from '../dist/story/housing-save.js';
import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';
const terrain=captureTerrainRecord(generateWorldPrototype(6).world,'generated-save-test'),initial=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only'),source=advanceGeneratedBridgeReview(initial,2000,'automatic');
const draft=createGeneratedSaveDraft(source),json=serializeGeneratedSaveDraft(draft);
test('year-zero lazy subsystems remain absent rather than being invented by the save boundary',()=>{
 const restored=restoreGeneratedSaveDraft(createGeneratedSaveDraft(initial));assert.deepEqual(restored.review.state,initial.review.state);assert.equal(Object.hasOwn(restored.review.state,'society'),false);assert.equal(Object.hasOwn(restored.review.state,'economy'),false);
 assert.deepEqual(advanceGeneratedBridgeReview(restored,10,'automatic').review.state,advanceGeneratedBridgeReview(initial,10,'automatic').review.state);
});
test('v5 generated draft retains immutable land births, original access, state and past scenes',()=>{
 const old=JSON.stringify(source),loaded=parseGeneratedSaveDraft(json),restored=restoreGeneratedSaveDraft(loaded);assert.ok(Object.isFrozen(loaded.state.history));
 assert.deepEqual(restored.review.state,source.review.state);assert.deepEqual(restored.review.placements,source.review.placements);assert.deepEqual(restored.review.bridgeReview,source.review.bridgeReview);
 assert.ok(loaded.landHistory.events.some(e=>e.purpose==='bridge'));assert.ok(loaded.landHistory.events.some(e=>e.purpose==='housing'));assert.ok(loaded.landHistory.events.every(e=>e.placement.access.length>0));
 for(const year of [0,756,1096,1104,2000])for(let site=0;site<3;site++)assert.deepEqual(observeGeneratedSceneReview(restored,year,site),observeGeneratedSceneReview(source,year,site));
 assert.equal(JSON.stringify(source),old);assert.throws(()=>validateHousingSave(loaded));
});
test('draft reload resumes the exact state and preserves a pending unconfirmed year',()=>{
 const restored=restoreGeneratedSaveDraft(draft),later=advanceGeneratedBridgeReview(restored,100,'automatic'),direct=advanceGeneratedBridgeReview(source,100,'automatic');assert.deepEqual(later.review.state,direct.review.state);
 const pending=advanceGeneratedBridgeReview(initial,1000,'stop');assert.ok(pending.review.state.pending);const loaded=restoreGeneratedSaveDraft(createGeneratedSaveDraft(pending));
 assert.deepEqual(loaded.review.state,pending.review.state);assert.deepEqual(chooseGeneratedBridgeReview(loaded,0).review.state,chooseGeneratedBridgeReview(pending,0).review.state);
});
test('unknown contracts, corrupt land/access/source/initial plans and future or inconsistent states fail closed',()=>{
 const brokenSource=structuredClone(source);brokenSource.review.bridgeReview.bridges[0].geometry.bankA=[NaN,170];assert.throws(()=>createGeneratedSaveDraft(brokenSource));
 const renamed=structuredClone(draft),old=renamed.state.housing.events[0].blockId;
 for(const e of renamed.state.housing.events)if(e.blockId===old){e.blockId='unknown-residential';e.after.blockId='unknown-residential';}
 for(const r of renamed.state.history)if(r.buildingId===old)r.buildingId='unknown-residential';for(const e of renamed.landHistory.events)if(e.objectId===old)e.objectId='unknown-residential';
 assert.throws(()=>validateGeneratedSaveDraft(renamed),'a coherently renamed ID must not load and then break future ID allocation');
 for(const mutate of [d=>d.version=4,d=>d.rendererId='future',d=>d.initialTerrain.mode='legacy-fixed',d=>d.progressionPolicy.id='future',d=>d.progressionPolicy.limits.normalRelief=2,
  d=>d.initialTerrain.record.schemaVersion=2,d=>delete d.initialTerrain.hydrology,d=>d.initialTerrain.plans['river-bank'].primaryRoot=[150,130],
  d=>d.landHistory.events[0].placement.access[0][0]++,d=>d.landHistory.events[0].placement.plot.x++,d=>d.landHistory.events[0].sourceRecordId='missing',d=>d.landHistory.events.pop(),
  d=>d.landHistory.events.push(structuredClone(d.landHistory.events[0])),d=>d.state.observation.sites[0].buildingChanges[1].building.x++,
  d=>d.state.observation.blocks[0].changes[0][0]=NaN,d=>d.state.observation.lastYear++,d=>d.state.society.sites[0].strain=NaN,d=>d.state.economy.districts[0].reserve=NaN,
  d=>d.state.housing.legacyUntracked=true,d=>d.state.housing.events[0].causeRecordId='missing',d=>delete d.landHistory.events[0].placement.access[0],d=>d.state.memory.legacies=new Date(),d=>d.extra=true]){
  const bad=structuredClone(draft);mutate(bad);const before=structuredClone(bad);assert.throws(()=>validateGeneratedSaveDraft(bad));assert.deepEqual(bad,before);
 }
});
test('v5 discovery is authoritative and atomic writes preserve old keys and export on quota failure',()=>{
 const legacy=JSON.stringify(createHousingCivilization(42)),store=new Map([['namonaki-story-v4',legacy],[REVIEW_V5_SAVE_KEY,json]]),reads=[];
 const found=findReviewSaveDraft(key=>{reads.push(key);return store.get(key)??null;});assert.equal(found.draft.initialTerrain.mode,'generated');assert.deepEqual(reads,[REVIEW_V5_SAVE_KEY]);
 store.set(REVIEW_V5_SAVE_KEY,'');reads.length=0;assert.throws(()=>findReviewSaveDraft(key=>{reads.push(key);return store.get(key)??null;}));assert.deepEqual(reads,[REVIEW_V5_SAVE_KEY]);
 store.set(REVIEW_V5_SAVE_KEY,json);const before=Array.from(store),quota={setItem(){throw new DOMException('controlled quota','QuotaExceededError');}},result=storeReviewSaveDraft(quota,draft);
 assert.equal(result.status,'not-saved');assert.equal(result.reason,'quota');assert.deepEqual(parseGeneratedSaveDraft(result.exportJson),draft);assert.deepEqual(Array.from(store),before);
 const writes=[];assert.equal(storeReviewSaveDraft({setItem:(key,value)=>writes.push([key,value])},draft).status,'saved');assert.deepEqual(writes.map(([key])=>key),[REVIEW_V5_SAVE_KEY]);assert.equal(store.get('namonaki-story-v4'),legacy);
});
