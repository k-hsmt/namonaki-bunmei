import test from 'node:test';import assert from 'node:assert/strict';
import {vegetationAt,vegetationStage,validateVegetationHistory,vegetationSites,vegetationOverlap} from '../dist/vegetation/history-v1.js';import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {createGeneratedWorldSave,restoreGeneratedWorld,validateWorldSave} from '../dist/story/world-save.js';import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';import {projectVegetation} from '../dist/vegetation/presentation-v1.js';import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';import {generatedSceneWalkContext} from '../dist/scene/generated-presentation-review.js';
function trial(events=[]){const initial=Object.fromEntries(vegetationSites.map(s=>[s,Array(440).fill(null)]));initial['river-bank'][0]=[0,1,4];initial['river-bank'][1]=[0,2,2];return {schemaVersion:1,ruleId:'patch-succession-v1',introducedYear:0,confirmedThrough:500,seed:1,initial,events};}
const action=(year,kind)=>({id:kind+year,year,site:'river-bank',kind,plot:{x:0,y:96,width:8,depth:8},sourceRecordId:'controlled-trial-'+year});
test('asynchronous growth and habitat ceilings distinguish grass, shrubs, young and mature stands',()=>{
 const v=trial();assert.deepEqual([0,8,28,75,150].map(y=>vegetationAt(v,y,'river-bank')[0].stage),[0,1,2,3,4]);assert.equal(vegetationAt(v,300,'river-bank')[1].stage,2);assert.equal(vegetationStage(100,4),3);
});
test('clearing, abandonment and fire restart local recovery without rewriting earlier observations',()=>{
 const v=trial([action(160,'clear'),action(200,'release'),action(380,'fire')]),old=trial();
 assert.deepEqual(vegetationAt(v,150,'river-bank'),vegetationAt(old,150,'river-bank'));assert.equal(vegetationAt(v,160,'river-bank')[0].stage,0);assert.equal(vegetationAt(v,228,'river-bank')[0].stage,2);assert.equal(vegetationAt(v,350,'river-bank')[0].stage,4);assert.equal(vegetationAt(v,380,'river-bank')[0].stage,0);assert.equal(vegetationAt(v,390,'river-bank')[1].stage,2,'the undisturbed adjacent patch keeps its history');
 assert.throws(()=>vegetationAt(v,501,'river-bank'));assert.throws(()=>vegetationAt(v,-1,'river-bank'));
});
const initial=createNewWorld(42,'terrain-placement-v3',true).review;
test('new vegetation does not consume civilization RNG or alter architecture, population or decisions',()=>{
 const plain=createNewWorld(42,'terrain-placement-v3').review,a=advanceGeneratedBridgeReview(initial,300,'automatic'),b=advanceGeneratedBridgeReview(plain,300,'automatic');assert.deepEqual(a.review.state,b.review.state);assert.deepEqual(a.review.placements,b.review.placements);assert.ok(a.vegetation.events.some(e=>e.kind==='clear'));assert.equal(b.vegetation,undefined);
});
test('batching, production gzip save/resume and old vegetation observations are exact',async()=>{
 const a=advanceGeneratedBridgeReview(initial,300,'automatic'),half=advanceGeneratedBridgeReview(initial,100,'automatic'),wire=await encodeWorldSave(createGeneratedWorldSave(half)),restored=restoreGeneratedWorld(await decodeWorldSave(wire.json)),b=advanceGeneratedBridgeReview(restored,200,'automatic');
 assert.deepEqual(createGeneratedWorldSave(a),createGeneratedWorldSave(b));assert.equal(createGeneratedWorldSave(a).rendererId,'generated-scene-v2');for(const site of vegetationSites)assert.deepEqual(vegetationAt(a.vegetation,99,site),vegetationAt(half.vegetation,99,site));assert.deepEqual(initial.vegetation.confirmedThrough,0);
});
test('a pending year cannot advance vegetation until the choice is committed',()=>{
 const pending=advanceGeneratedBridgeReview(initial,1000,'stop');assert.ok(pending.review.state.pending);assert.equal(pending.vegetation.confirmedThrough,pending.review.state.year-1);assert.throws(()=>vegetationAt(pending.vegetation,pending.review.state.year,'river-bank'));
 const chosen=chooseAutomaticallyGeneratedBridgeReview(pending);assert.equal(chosen.vegetation.confirmedThrough,chosen.review.state.year);
});
test('legacy generated v5 never acquires imagined vegetation or a different renderer on restore',()=>{
 const plain=createNewWorld(42,'terrain-placement-v3').review,save=createGeneratedWorldSave(plain),restored=restoreGeneratedWorld(JSON.parse(JSON.stringify(save)));assert.equal(save.rendererId,'generated-scene-v1');assert.equal(save.vegetation,undefined);assert.equal(restored.vegetation,undefined);assert.deepEqual(createGeneratedWorldSave(restored),save);
});
test('unknown versions, future years, mismatched renderers and altered event sources fail closed',()=>{
 const save=createGeneratedWorldSave(advanceGeneratedBridgeReview(initial,100,'automatic'));
 for(const mutate of [s=>s.vegetation.schemaVersion=2,s=>s.vegetation.ruleId='future',s=>s.vegetation.confirmedThrough++,s=>s.vegetation.seed++,s=>s.rendererId='generated-scene-v1',s=>delete s.vegetation,s=>s.vegetation.initial['river-bank'][0]=[0,9,4],s=>s.vegetation.events[0].sourceRecordId='invented',s=>s.vegetation.events.pop()]){const c=structuredClone(save);mutate(c);assert.throws(()=>validateWorldSave(c));}
 const c=structuredClone(initial.vegetation);c.extra=true;assert.throws(()=>validateVegetationHistory(c,initial.review));
});
test('roots and plant marks avoid water, unstable ground and occupied plots across all three sites',()=>{
 const r=advanceGeneratedBridgeReview(initial,300,'automatic');
 for(let i=0;i<3;i++){
  const o=observeGeneratedSceneReview(r,300,i),p=projectVegetation(o),raster=decodeRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),ctx=generatedSceneWalkContext(o),live=new Set(o.snapshot.objects.filter(b=>b.kind!=='field'||b.condition!=='ruined').map(b=>b.id)),occupied=ctx.occupancy.filter(p=>!o.ground.facilities.some(f=>f.id===p.id&&!live.has(f.id)));
  for(const {point:[x,y]} of p.trees)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const j=(y+dy)*320+x+dx;assert.equal(raster.surface[j],1);assert.equal(raster.bearing[j],0);assert.ok(raster.grade[j]<=1);assert.ok(occupied.every(q=>!vegetationOverlap({x:x+dx,y:y+dy,width:1,depth:1},q.plot)));}
  assert.ok(p.trees.length<=22&&p.shrubs.length<=32);for(const {point:[x,y]} of [...p.grass,...p.shrubs,...p.trees]){assert.equal(raster.surface[y*320+x],1);assert.equal(raster.bearing[y*320+x],0);assert.ok(occupied.every(q=>!vegetationOverlap({x,y,width:1,depth:1},q.plot)));}
 }
});
