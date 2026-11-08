import test from 'node:test';import assert from 'node:assert/strict';
import {createNewWorld} from '../dist/story/new-world.js';import {saveWorldSession,restoreWorldSession,advanceWorldSession,chooseWorldSession,generatedSession} from '../dist/story/world-session.js';
import {productionPlacementPolicy,parseWorldSave,validateWorldSave,migrateOldWorld} from '../dist/story/world-save.js';import {encodeWorldSave,decodeWorldSave,findWorldSave,storeWorldSave} from '../dist/story/world-storage.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';import {createHousingCivilization,parseHousingSave} from '../dist/story/housing-persistence.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
const initial=createNewWorld(42);
test('new worlds freeze approved production policy and roundtrip through production gzip',async()=>{
 const save=saveWorldSession(initial),encoded=await encodeWorldSave(save),loaded=await decodeWorldSave(encoded.json),restored=restoreWorldSession(loaded);
 assert.equal(save.format,'namonaki-world-save');assert.equal(save.version,5);assert.equal(save.initialTerrain.mode,'generated');assert.deepEqual(save.progressionPolicy,productionPlacementPolicy);assert.equal(save.progressionPolicy.reservationMode,'field-only');
 assert.deepEqual(restored.state,initial.state);assert.deepEqual(advanceWorldSession(restored).state,advanceWorldSession(initial).state);
 const wrong=structuredClone(save);wrong.progressionPolicy.reservationMode='none';assert.throws(()=>validateWorldSave(wrong));
 const unknown=structuredClone(save);unknown.rendererId='future';assert.throws(()=>validateWorldSave(unknown));
});
test('old worlds stay legacy-fixed and continue exactly through the original engine',()=>{
 const old=createCivilization(42);for(let i=0;i<12;i++){step(old);if(old.pending)chooseAutomatically(old);}const raw=JSON.stringify(old),session=restoreWorldSession(parseWorldSave(raw)),baseline=parseHousingSave(raw),length=baseline.history.length;
 for(let i=0;i<36&&!baseline.pending;i++){step(baseline);if(baseline.history.length>length)break;}
 assert.equal(session.mode,'legacy-fixed');assert.deepEqual(advanceWorldSession(session).state,baseline);const saved=saveWorldSession(session);assert.equal(saved.initialTerrain.mode,'legacy-fixed');assert.equal(saved.origin.saveVersion,3);assert.equal(JSON.stringify(old),raw);
});
test('automatic generated choices consume the same RNG and complete only the pending year',()=>{
 const pending=advanceGeneratedBridgeReview(initial.review,1000,'stop'),baseline=createHousingCivilization(42);while(!baseline.pending)step(baseline);assert.equal(pending.review.state.year,baseline.year);
 const original=JSON.stringify(pending),result=chooseWorldSession(generatedSession(pending),'random');chooseAutomatically(baseline);
 for(const key of ['year','rngState','population','food','cohesion','knowledge','culture','exchange','decisions'])assert.deepEqual(result.state[key],baseline[key],key);
 assert.equal(result.state.pending,null);assert.equal(JSON.stringify(pending),original);
});
test('current v5 corruption stops discovery and failed production writes preserve export data',async()=>{
 const reads=[];await assert.rejects(()=>findWorldSave(k=>{reads.push(k);return k==='namonaki-story-v6'?null:k==='namonaki-story-v5'?'broken':JSON.stringify(createCivilization(42));}));assert.deepEqual(reads,['namonaki-story-v6','namonaki-story-v5']);
 const result=await storeWorldSave({setItem(){throw new DOMException('controlled','QuotaExceededError');}},saveWorldSession(initial));assert.equal(result.status,'not-saved');assert.deepEqual(restoreWorldSession(await decodeWorldSave(result.exportJson)).state,initial.state);
});
