import test from 'node:test';import assert from 'node:assert/strict';
import {createNewIrrigatedWorld,createNewWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {generatedSession,enableWorldEconomicCoupling,prepareWorldSessionSave,saveWorldSession,restoreWorldSession,advanceWorldSession,chooseWorldSession,observeWorldSession,observeGeneratedWorldSession,economicProductionSession,enableWorldIrrigation,improveWorldEnvironment,slowWorldClimate} from '../dist/story/world-session.js';
import {advanceEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {createEnvironment} from '../dist/environment/progression-v1.js';
const initial=createNewIrrigatedWorld(42);
const wire=async s=>JSON.stringify(await prepareWorldSessionSave(s));
test('session introduction preserves prior observations, offers async v7 save and restores continued progress',async()=>{
 const old=generatedSession(advanceGeneratedBridgeReview(initial.review,575,'automatic')),before=await wire(old),s=await enableWorldEconomicCoupling(old);
 assert.ok(await wire(old)===before);for(const year of [0,100,575])for(let site=0;site<3;site++)assert.deepEqual(observeGeneratedWorldSession(s,year,site),observeGeneratedWorldSession(old,year,site));
 assert.equal(await enableWorldEconomicCoupling(s),s);assert.throws(()=>saveWorldSession(s),/prepareWorldSessionSave/);
 const save=await prepareWorldSessionSave(s);assert.equal(save.version,7);const loaded=restoreWorldSession(await decodeWorldSave((await encodeWorldSave(save)).json));
 assert.ok(await wire(advanceWorldSession(loaded))===await wire(advanceWorldSession(s)));assert.equal((await prepareWorldSessionSave(initial)).version,6);
});
test('session rejects pending introduction and preserves manual/autonomous choice completion',async()=>{
 const pending=generatedSession(advanceGeneratedBridgeReview(initial.review,1000,'stop'));await assert.rejects(()=>enableWorldEconomicCoupling(pending),/confirmed/);
 const s=await enableWorldEconomicCoupling(initial),held=economicProductionSession(advanceEconomicProductionWorld(s.review,1000,'stop'));
 assert.equal(advanceWorldSession(held,0),held);for(const index of [0,'random']){const chosen=chooseWorldSession(held,index);assert.equal(chosen.review.economicCoupling.confirmedThrough,held.state.year);assert.equal(chosen.review.economicCoupling.prepared,null);assert.ok(await wire(restoreWorldSession(await decodeWorldSave((await encodeWorldSave(await prepareWorldSessionSave(chosen))).json)))===await wire(chosen));}
 assert.throws(()=>advanceWorldSession({...s,state:structuredClone(s.state)}),/state differs/);
});
test('existing explicit scenery and future climate upgrades remain readable after economic adoption',async()=>{
 const d2=createNewWorld(42).review,old=enableWorldIrrigation(generatedSession({...d2,environment:createEnvironment(d2.vegetation,d2.review,false),environmentAppearance:'landscape-v2'})),at99=generatedSession(advanceGeneratedBridgeReview(old.review,99,'automatic')),s=await enableWorldEconomicCoupling(at99),before=observeGeneratedWorldSession(s,99);
 const upgraded=improveWorldEnvironment(slowWorldClimate(s));assert.equal(upgraded.review.environment.climateStart,100);assert.equal(upgraded.review.environmentAppearance,'landscape-v3');assert.deepEqual(observeGeneratedWorldSession(upgraded,99).ground.environment,before.ground.environment);
 const progressed=economicProductionSession(advanceEconomicProductionWorld(upgraded.review,250,'automatic')),loaded=restoreWorldSession(await decodeWorldSave((await encodeWorldSave(await prepareWorldSessionSave(progressed))).json));
 assert.ok(await wire(loaded)===await wire(progressed));assert.equal(loaded.review.environment.climateRule,'environment-coupled-v2');
});
