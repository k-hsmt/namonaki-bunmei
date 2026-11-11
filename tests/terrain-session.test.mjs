import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewEconomicWorld,createNewTerrainWorld} from '../dist/story/new-world.js';
import {advanceEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {advanceTerrainProductionWorld} from '../dist/terrain/terrain-production-progression-v1.js';
import {economicProductionSession,terrainProductionSession,enableWorldTerrainDevelopment,advanceWorldSession,advanceWorldSessionAsync,chooseWorldSessionAsync,prepareWorldSessionSave,restoreWorldSession,observeGeneratedWorldSession,worldTerrainDevelopmentAtYear} from '../dist/story/world-session.js';
import {higherPriorityWorldSaveKeys,decodeWorldSave,encodeWorldSave} from '../dist/story/world-storage.js';

const old=await createNewEconomicWorld(42),initial=await enableWorldTerrainDevelopment(old);
test('versioned v7 remains explicit; normal v8 session is owned, future only, and native restorable',async()=>{
 assert.equal((await prepareWorldSessionSave(old)).version,7);
 const previous=economicProductionSession(advanceEconomicProductionWorld(old.review,575,'automatic')),adopted=await enableWorldTerrainDevelopment(previous);
 assert.equal(await enableWorldTerrainDevelopment(adopted),adopted);
 assert.equal(worldTerrainDevelopmentAtYear(old,0),null);
 for(const year of [0,100,574,575])for(let site=0;site<3;site++){const a=observeGeneratedWorldSession(adopted,year,site),b=observeGeneratedWorldSession(previous,year,site);assert.deepEqual(a.snapshot,b.snapshot);assert.deepEqual(a.ground.vegetation,b.ground.vegetation);assert.deepEqual(a.ground.terrain.sites[a.ground.site].physics,b.ground.terrain.sites[b.ground.site].physics);}
 assert.equal(worldTerrainDevelopmentAtYear(adopted,100).introducedYear,575);
 const packet=await prepareWorldSessionSave(await createNewTerrainWorld(42));assert.equal(packet.version,8);assert.deepEqual(packet,await prepareWorldSessionSave(initial));
 assert.deepEqual(await prepareWorldSessionSave(restoreWorldSession(await decodeWorldSave((await encodeWorldSave(packet)).json))),packet);
 assert.throws(()=>terrainProductionSession(structuredClone(initial.review)),/owned|validated/);
 await assert.rejects(()=>prepareWorldSessionSave({...initial,state:structuredClone(initial.state)}),/state differs/);
});
test('asynchronous session transitions stop at choices and only expose approved ground from the following year',async()=>{
 assert.throws(()=>advanceWorldSession(initial),/asynchronous/);
 assert.equal(await advanceWorldSessionAsync(initial,0),initial);
 for(const n of [-1,NaN,1.5,10001])await assert.rejects(()=>advanceWorldSessionAsync(initial,n));
 const at100=terrainProductionSession(await advanceTerrainProductionWorld(initial.review,100,'automatic')),at101=terrainProductionSession(await advanceTerrainProductionWorld(at100.review,1,'automatic'));
 assert.deepEqual(worldTerrainDevelopmentAtYear(at100,100),{introducedYear:0,activeCount:0,pendingCount:1,uses:[]});
 assert.equal(worldTerrainDevelopmentAtYear(at101,100).activeCount,0);assert.equal(worldTerrainDevelopmentAtYear(at101,101).activeCount,1);
 assert.throws(()=>worldTerrainDevelopmentAtYear(at101,102),/Unconfirmed/);
 const pending=terrainProductionSession(await advanceTerrainProductionWorld(initial.review,1000,'stop'));
 assert.ok(pending.state.pending);const chosen=await chooseWorldSessionAsync(pending,0);assert.ok(!chosen.state.pending);assert.equal(pending.state.pending.options.length>0,true);
 assert.deepEqual((await advanceWorldSessionAsync(chosen)).review.terrainHistory.events.slice(0,pending.review.terrainHistory.events.length),pending.review.terrainHistory.events);
});
test('only a successful explicit older save may supersede its higher priority slots',async()=>{
 assert.deepEqual(higherPriorityWorldSaveKeys(await prepareWorldSessionSave(initial)),['namonaki-story-v9'],'an explicit v8 save supersedes a stale v9 slot (D2-d)');
 assert.deepEqual(higherPriorityWorldSaveKeys(await prepareWorldSessionSave(old)),['namonaki-story-v8','namonaki-story-v9']);
 const held=economicProductionSession(advanceEconomicProductionWorld(old.review,1000,'stop'));await assert.rejects(()=>enableWorldTerrainDevelopment(held));
});
