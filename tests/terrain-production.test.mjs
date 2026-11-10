import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewWorld,createNewIrrigatedWorld,createNewEconomicWorld} from '../dist/story/new-world.js';
import {introduceEconomicProduction,advanceEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {introduceTerrainProduction,advanceTerrainProductionWorld,chooseTerrainProductionWorld,slowTerrainProductionClimate,improveTerrainProductionEnvironment} from '../dist/terrain/terrain-production-progression-v1.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {coupleVegetation,createEnvironment} from '../dist/environment/progression-v1.js';
import {introduceProductionIrrigation} from '../dist/irrigation/production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import {validateTerrainProductionSave,restoreTerrainProductionSave} from '../dist/terrain/terrain-production-history-v1.js';
import {createTerrainTrial,advanceTerrainTrial} from '../dist/terrain/terrain-trial-progression-v1.js';
import {prepareTerrainTrialSave} from '../dist/terrain/terrain-trial-storage-v1.js';
import {validateTerrainTrialSave} from '../dist/terrain/terrain-trial-history-v1.js';
import {observeTerrainProductionScene} from '../dist/scene/terrain-production-scene-v1.js';
import {observeEconomicProductionScene} from '../dist/scene/economic-production-scene-v1.js';
import {observeTerrainTrialScene} from '../dist/scene/terrain-trial-scene-v1.js';
const source=(await createNewEconomicWorld(42)).review;
const cold=async w=>restoreTerrainProductionSave(await validateTerrainProductionSave(JSON.parse(JSON.stringify(await prepareTerrainProductionSave(w)))));
const changes=w=>w.terrainHistory.events.map(({ruleId,parentRevision,revisionId,...e})=>e);

test('owned v7 introduces production terrain with distinct rules, native packets and unchanged accepted geometry',async()=>{
 const origin=await introduceTerrainProduction(source),world=await advanceTerrainProductionWorld(origin,700,'automatic'),trial=await advanceTerrainTrial(await createTerrainTrial(source),700,'automatic');
 assert.equal(await introduceTerrainProduction(origin),origin);assert.equal(origin.terrainDevelopment.introducedYear,0);assert.equal(origin.terrainHistory.events.length,0);
 assert.equal(world.terrainDevelopment.economicRule.additionalWorkBp,0);assert.equal(world.terrainDevelopment.runtimeRules.geometry,'terrain-cut-v1');assert.equal(world.terrainHistory.events.length,2);assert.ok(world.terrainHistory.events.every(e=>e.ruleId==='terrain-cut-v1'));
 assert.deepEqual(changes(world),changes(trial));assert.deepEqual(world.economicCoupling,trial.economicCoupling);
 const packet=await prepareTerrainProductionSave(world);assert.equal(packet.version,8);assert.equal(packet.rendererId,'generated-scene-v7');assert.equal(packet.landHistory.terrainPolicyBoundary,'terrain-development-v1');assert.equal(packet.terrainHistory.format,'terrain-history-v1');assert.equal(packet.terrainDevelopment.originPrefix.format,'terrain-production-origin-prefix-v1');assert.equal(Object.hasOwn(packet,'terrainChanges'),false);
 assert.deepEqual(await prepareTerrainProductionSave(await cold(world)),packet);
 assert.deepEqual(await prepareTerrainProductionSave(await advanceTerrainProductionWorld(await cold(await advanceTerrainProductionWorld(origin,600,'automatic')),100,'automatic')),packet);
 for(const v of [trial,structuredClone(world),{...trial,format:world.format,status:'production'}])await assert.rejects(()=>prepareTerrainProductionSave(v),/owned|validated/);
 await assert.rejects(()=>validateTerrainTrialSave(packet));await assert.rejects(async()=>validateTerrainProductionSave(await prepareTerrainTrialSave(trial)));
 assert.throws(()=>observeTerrainTrialScene(world,700));assert.throws(()=>observeTerrainProductionScene(trial,700));
});

test('approved terrain switches at Y+1 exactly once, and introduction preserves the entire earlier v7 projection',async()=>{
 const origin=await introduceTerrainProduction(source),at100=await advanceTerrainProductionWorld(origin,100,'automatic'),loaded=await cold(at100),a=await advanceTerrainProductionWorld(loaded,1,'automatic'),b=await advanceTerrainProductionWorld(origin,101,'automatic');
 assert.deepEqual(await prepareTerrainProductionSave(a),await prepareTerrainProductionSave(b));assert.equal(observeTerrainProductionScene(at100,100,1).ground.terrain.changes.length,0);assert.equal(observeTerrainProductionScene(a,101,1).ground.terrain.changes.length,1);
 const previous=advanceEconomicProductionWorld(source,575,'automatic'),later=await introduceTerrainProduction(previous);
 for(const year of [0,100,300,574,575])for(let site=0;site<3;site++){
  const before=observeEconomicProductionScene(previous,year,site),after=observeTerrainProductionScene(later,year,site);
  assert.deepEqual(after.snapshot,before.snapshot);assert.deepEqual(after.ground.terrain.sites[after.ground.site].physics,before.ground.terrain.sites[before.ground.site].physics);assert.deepEqual(after.ground.vegetation,before.ground.vegetation);
 }
 const held=advanceEconomicProductionWorld(source,1000,'stop');await assert.rejects(()=>introduceTerrainProduction(held));
 const pending=await advanceTerrainProductionWorld(origin,1000,'stop');assert.ok(pending.review.state.pending);assert.equal(await advanceTerrainProductionWorld(pending,0),pending);assert.equal((await chooseTerrainProductionWorld(pending,'random')).economicCoupling.phases.at(-1).draws,1);
 await assert.rejects(()=>chooseTerrainProductionWorld(pending,0,'stale'));
});

test('later economic and terrain origins retain different prefixes and checkpoint offsets',async()=>{
 const b=advanceGeneratedBridgeReview(createNewIrrigatedWorld(42).review,575,'automatic'),e=await introduceEconomicProduction(b),at625=advanceEconomicProductionWorld(e,50,'automatic'),root=await introduceTerrainProduction(at625),world=await advanceTerrainProductionWorld(root,75,'automatic');
 assert.equal(world.economicCoupling.introducedYear,575);assert.equal(world.terrainDevelopment.introducedYear,625);assert.equal(world.economicCoupling.checkpoints[0].year,675);assert.deepEqual(await prepareTerrainProductionSave(await cold(world)),await prepareTerrainProductionSave(world));
});

test('future climate upgrades preserve old appearance and cannot change the terrain adoption past',async()=>{
 const initial=createNewWorld(42,'terrain-placement-v3',true,false).review,v=coupleVegetation(initial.vegetation),base=introduceProductionIrrigation({...initial,vegetation:v,environment:createEnvironment(v,initial.review),environmentAppearance:'landscape-v2'}),e=await introduceEconomicProduction(base),at625=advanceEconomicProductionWorld(e,625,'automatic'),root=await introduceTerrainProduction(at625),slower=slowTerrainProductionClimate(root);
 assert.equal(root.environmentAppearance,'landscape-v2');assert.equal(slower.environment.climateStart,700);assert.equal(improveTerrainProductionEnvironment(root).environmentAppearance,'landscape-v3');assert.deepEqual(improveTerrainProductionEnvironment(root).economicCoupling,root.economicCoupling);
 const world=await advanceTerrainProductionWorld(slower,100,'automatic');assert.deepEqual(await prepareTerrainProductionSave(await cold(world)),await prepareTerrainProductionSave(world));
 const raw=structuredClone(await prepareTerrainProductionSave(world));raw.environment.climateStart=600;const {payloadHash,...body}=raw;const {terrainRevisionHash}=await import('../dist/terrain/terrain-revision-wire-v1.js');raw.payloadHash=await terrainRevisionHash(body);await assert.rejects(()=>validateTerrainProductionSave(raw));
});
