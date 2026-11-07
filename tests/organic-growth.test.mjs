import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {createGeneratedWorldSave,restoreGeneratedWorld,validateWorldSave} from '../dist/story/world-save.js';import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';import {housingAt} from '../dist/story/housing-history.js';
const span=outer=>{
 const o=observeGeneratedSceneReview(outer,100,0),plots=[...o.ground.facilities.filter(f=>f.purpose!=='field').map(f=>f.plot),...housingAt(outer.review.state.housing,100,'river-bank').blocks.map(b=>b.footprint)];
 return {count:plots.length,width:Math.max(...plots.map(p=>p.x+p.width))-Math.min(...plots.map(p=>p.x)),depth:Math.max(...plots.map(p=>p.y+p.depth))-Math.min(...plots.map(p=>p.y))};
};
test('new-world organic growth spreads natural buildings and preserves policy across save/resume',()=>{
 const compact=advanceGeneratedBridgeReview(createNewWorld(10,'terrain-placement-v1').review,100,'automatic');
 const initial=createNewWorld(10,'terrain-placement-v2'),organic=advanceGeneratedBridgeReview(initial.review,100,'automatic'),before=JSON.stringify(organic),a=span(compact),b=span(organic);
 assert.equal(b.count,a.count);assert.ok(b.width>a.width&&b.depth>a.depth,'spread without fabricating extra buildings');
 const save=createGeneratedWorldSave(organic),restored=restoreGeneratedWorld(JSON.parse(JSON.stringify(save)));
 assert.equal(save.progressionPolicy.id,'terrain-placement-v2');assert.equal(restored.review.growthPattern,'organic-v2');
 const continued=advanceGeneratedBridgeReview(restored,200,'automatic'),direct=advanceGeneratedBridgeReview(organic,200,'automatic');
 assert.deepEqual(createGeneratedWorldSave(continued),createGeneratedWorldSave(direct));
 assert.equal(JSON.stringify(organic),before);
 const future=structuredClone(save);future.progressionPolicy.id='terrain-placement-v99';assert.throws(()=>validateWorldSave(future));
 assert.throws(()=>createNewWorld(10,'future'));
});
test('saved compact worlds keep their original full state and future placement policy',()=>{
 const compact=createNewWorld(1,'terrain-placement-v1').review,save=createGeneratedWorldSave(compact),restored=restoreGeneratedWorld(JSON.parse(JSON.stringify(save)));
 assert.equal(save.progressionPolicy.id,'terrain-placement-v1');assert.equal(restored.review.growthPattern,undefined);
 assert.deepEqual(restored.review.state,compact.review.state);assert.deepEqual(restored.review.plans,compact.review.plans);
 const future=advanceGeneratedBridgeReview(restored,2000,'automatic');
 const expected=JSON.parse(readFileSync('tests/fixtures/generated-progression-reference-v1.json')).cases.find(c=>c.seed===1&&c.year===2000).stateSha256;
 assert.equal(createHash('sha256').update(JSON.stringify(future.review.state)).digest('hex'),expected);
 assert.equal(createGeneratedWorldSave(future).progressionPolicy.id,'terrain-placement-v1');
});
