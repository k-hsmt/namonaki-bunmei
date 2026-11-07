import test from 'node:test';import assert from 'node:assert/strict';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';import {composeScene} from '../dist/scene/composition.js';
import {housingAt} from '../dist/story/housing-history.js';import {findHousingGroundConflicts} from '../dist/scene/housing-ground.js';
import {composeGeneratedScene} from '../dist/scene/generated-ground-review.js';
const t=captureTerrainRecord(generateWorldPrototype(6).world,'scene-test'),initial=createGeneratedBridgeReview(t,captureRiverReaches(t),'field-only'),finished=advanceGeneratedBridgeReview(initial,2000,'automatic');
test('all three generated scenes use saved ground and confirmed structures without changing history',()=>{
 const before=JSON.stringify(finished);
 for(let index=0;index<3;index++){
  const {snapshot:s,composition:c,ground}=observeGeneratedSceneReview(finished,2000,index);
  assert.equal(c.generatedGround,ground);assert.equal(c.siteIndex,index);assert.deepEqual(c.structures.map(o=>o.id),s.objects.map(o=>o.id));
  for(const b of c.residentialBlocks)for(const p of b.roofParts){assert.ok(p.y<b.footprint.y+b.footprint.depth);assert.ok(p.y>=b.footprint.y);}
  assert.equal(ground.bridges.length,index===0?1:0);
 }
 assert.equal(JSON.stringify(finished),before);
 const o=observeGeneratedSceneReview(finished,2000,0),homes=housingAt(finished.review.state.housing,2000,'river-bank').blocks;
 assert.ok(findHousingGroundConflicts(homes,o.snapshot.objects,0).some(c=>c.reason==='river'),'fixture includes legitimate land inside the old fixed river');
 assert.throws(()=>composeScene(o.snapshot,finished.review.state.housing));
});
test('historical scene projection excludes future bridge geometry and later repairs',()=>{
 for(const [year,condition] of [[755,undefined],[756,'intact'],[1096,'damaged'],[1104,'intact'],[1289,'ruined']]){
  const o=observeGeneratedSceneReview(finished,year,0);assert.equal(o.snapshot.objects.find(b=>b.kind==='bridge')?.condition,condition);
  assert.equal(o.ground.bridges.length,condition===undefined?0:1);assert.ok(o.composition.structures.every(b=>b.builtYear<=year));
 }
 assert.throws(()=>observeGeneratedSceneReview(finished,2001,0));assert.throws(()=>observeGeneratedSceneReview(finished,1000,3));
});
test('generated projection rejects display/ground disagreement, water housing and omitted bridge shapes',()=>{
 const {snapshot,ground}=observeGeneratedSceneReview(finished,2000,0);
 const moved=structuredClone(snapshot);moved.objects[0].x++;assert.throws(()=>composeGeneratedScene(moved,finished.review.state.housing,ground));
 assert.throws(()=>composeGeneratedScene(snapshot,finished.review.state.housing,{...ground,bridges:[]}));
 assert.throws(()=>composeGeneratedScene(snapshot,finished.review.state.housing,{...ground,site:'hill-side'}));
 const housing=structuredClone(finished.review.state.housing),id=housing.events[0].blockId;
 for(const e of housing.events.filter(e=>e.blockId===id))e.after.footprint={x:155,y:146,width:18,depth:8};
 assert.throws(()=>composeGeneratedScene(snapshot,housing,ground));
});
