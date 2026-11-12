import test from 'node:test';import assert from 'node:assert/strict';
import {createNewWorld,createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createIrrigationReview} from '../dist/irrigation/progression-v1.js';
import {observeIrrigationReview} from '../dist/irrigation/history-v1.js';
import {projectProductionEnvironment} from '../dist/irrigation/production-history-v1.js';
import {generatedSession,enableWorldIrrigation,saveWorldSession,restoreWorldSession,slowWorldClimate,improveWorldEnvironment} from '../dist/story/world-session.js';
import {parseWorldSaveAsync,serializeWorldSave} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave,storeWorldSave,findWorldSave} from '../dist/story/world-storage.js';
import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';
const advance=(s,y,mode='automatic')=>advanceGeneratedBridgeReview(s,y,mode);
const base=createNewWorld(42).review,production=createNewIrrigatedWorld(42).review;
test('production keeps the complete A3 lifecycle/ecology and D2 civilization for five natural worlds',async()=>{
 for(const seed of [1,21,29,42,198]){const b=advance(createNewWorld(seed).review,1000),p=advance(createNewIrrigatedWorld(seed).review,1000),a=await createIrrigationReview(b,0);assert.deepEqual(p.review.state,b.review.state,'civilization '+seed);assert.deepEqual(p.irrigation.events,a.events);assert.deepEqual(p.irrigation.attempts,a.attempts);const{channel,...state}=p.environment.current;assert.deepEqual(state,a.current.environment);assert.deepEqual(channel,a.current.channel);
 for(const year of [0,99,100,575,615,1000])for(const site of ['river-bank','hill-side','coast-inlet']){const x=projectProductionEnvironment(p,year,site),y=observeIrrigationReview(a,year,site);assert.deepEqual(x.environment,y.environment);assert.deepEqual(x.vegetation,y.vegetation);}}
});
test('v6 has one world and one ecology, plain/gzip/restart reproduce a split continuation',async()=>{
 const p=advance(production,614),save=saveWorldSession(generatedSession(p));assert.equal(save.version,6);assert.equal('base' in save.irrigation,false);assert.equal('checkpoints' in save.irrigation,false);assert.equal('current' in save.irrigation,false);const wire=await encodeWorldSave(save),loaded=restoreWorldSession(await decodeWorldSave(wire.json));assert.deepEqual(saveWorldSession(loaded),save);
 const split=advance(loaded.review,86),whole=advance(production,700);assert.deepEqual(saveWorldSession(generatedSession(split)),saveWorldSession(generatedSession(whole)));assert.deepEqual(await parseWorldSaveAsync(serializeWorldSave(save)),save);
});
test('mid-interval opt-in preserves every past model value, climate and appearance boundary',()=>{
 for(const j of [0,99,100,237]){const b=advance(base,j),before=JSON.stringify(b),adopted=enableWorldIrrigation(generatedSession({...b,environmentAppearance:'landscape-v2'}));assert.equal(JSON.stringify(b),before);assert.equal(adopted.review.irrigation.introducedYear,j);assert.deepEqual(adopted.state,b.review.state);assert.deepEqual(adopted.review.environment.targets,b.environment.targets);assert.equal(enableWorldIrrigation(adopted).review,adopted.review);
 for(const year of [...new Set([0,j])])for(let site=0;site<3;site++){const old=observeGeneratedSceneReview({...b,environmentAppearance:'landscape-v2'},year,site),now=observeGeneratedSceneReview(adopted.review,year,site);assert.deepEqual(now.ground.environment,old.ground.environment);assert.deepEqual(now.ground.vegetation,old.ground.vegetation);assert.equal(now.ground.environmentAppearance,'landscape-v2');}
 const detailed=improveWorldEnvironment(adopted);assert.equal(observeGeneratedSceneReview(detailed.review,j).ground.environmentAppearance,'landscape-v2');assert.deepEqual(slowWorldClimate(adopted).review.environment.targets,b.environment.targets);}
});
test('pending choices never advance canals or ecology until the year is confirmed',()=>{
 const pending=advance(production,1000,'stop'),boundary=pending.irrigation.confirmedThrough;assert.equal(pending.review.state.year,boundary+1);const again=advance(pending,20,'stop');assert.deepEqual(again.irrigation,pending.irrigation);assert.deepEqual(again.environment,pending.environment);const chosen=chooseAutomaticallyGeneratedBridgeReview(pending),baseline=chooseAutomaticallyGeneratedBridgeReview(advance(base,1000,'stop'));assert.deepEqual(chosen.review.state,baseline.review.state);assert.equal(chosen.irrigation.confirmedThrough,chosen.environment.confirmedThrough);
});
test('v6 reader rejects mixed versions, controlled input, foreign geometry and altered snapshots',async()=>{
 const save=saveWorldSession(generatedSession(advance(production,700)));for(const mutate of [s=>s.version=5,s=>s.rendererId='generated-scene-v5',s=>s.irrigation.controls=[],s=>s.irrigation.events[0].cause={kind:'controlled-input',inputId:'fake'},s=>s.irrigation.systems[0].geometry.source.seed++,s=>s.environment.current.patches['river-bank'][0][0]++,s=>s.irrigation.introducedYear=99,s=>s.environment.checkpoints[0].channel={id:'fake'},s=>s.irrigation.events.push(s.irrigation.events[0])]){const bad=structuredClone(save);mutate(bad);await assert.rejects(()=>parseWorldSaveAsync(JSON.stringify(bad)));}
 const outer=JSON.parse((await encodeWorldSave(save)).json);outer.version=5;await assert.rejects(()=>decodeWorldSave(JSON.stringify(outer)));
});
test('new storage priority stops on corruption and explicit old saves supersede stale v6 without changing format',async()=>{
 const old=saveWorldSession(generatedSession(base)),current=saveWorldSession(generatedSession(production)),values=new Map([['namonaki-story-v5',serializeWorldSave(old)],['namonaki-story-v6',serializeWorldSave(current)]]);await storeWorldSave({setItem:(k,v)=>values.set(k,v)},old);const found=await findWorldSave(k=>values.get(k)??null);assert.equal(found.version,5);assert.equal(values.get('namonaki-story-v5'),serializeWorldSave(old));values.set('namonaki-story-v6','broken');const reads=[];await assert.rejects(()=>findWorldSave(k=>{reads.push(k);return values.get(k)??null;}));assert.deepEqual(reads,['namonaki-story-v10','namonaki-story-v9','namonaki-story-v8','namonaki-story-v7','namonaki-story-v6']);
});
