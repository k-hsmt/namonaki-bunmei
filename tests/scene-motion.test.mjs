import test from 'node:test';import assert from 'node:assert/strict';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';import {planSceneMotion,journeyAt,sceneActivityCount} from '../dist/scene/motion-plan.js';import {createGeneratedWorldSave} from '../dist/story/world-save.js';
const initial=createNewWorld(42).review,world=advanceGeneratedBridgeReview(initial,1000,'automatic'),entrances=new Map(createGeneratedWorldSave(world).landHistory.events.map(e=>[e.objectId,e.placement.entrance]));
test('purposeful journeys connect actual active homes and facilities through 2px walk windows',()=>{
 let trips=0,crossings=0;
 for(let site=0;site<3;site++){
  const o=observeGeneratedSceneReview(world,1000,site),before=JSON.stringify(world),p=planSceneMotion(o),targets=new Map(o.snapshot.objects.map(b=>[b.id,b])),raster=decodeRecordPhysics(o.ground.terrain.sites[o.ground.site].physics);assert.ok(p.journeys.length+p.idle.length<=6);assert.deepEqual(p,planSceneMotion(o));
  const homeIds=new Set([...o.ground.facilities.filter(f=>f.purpose==='house').map(f=>f.id),...o.composition.residentialBlocks.filter(b=>b.use!=='vacant'&&b.condition!=='ruined').map(b=>b.blockId)]);
  for(const j of p.journeys){trips++;assert.deepEqual(j.path[0],entrances.get(j.homeId));assert.deepEqual(j.path.at(-1),entrances.get(j.targetId));assert.ok(homeIds.has(j.homeId));assert.equal(targets.get(j.targetId).condition,'intact');assert.ok(['field','market','workshop'].includes(j.purpose));for(let n=0;n<j.path.length;n++){const [x,y]=j.path[n];assert.equal(p.windows[y*320+x],1);if(n)assert.equal(Math.abs(x-j.path[n-1][0])+Math.abs(y-j.path[n-1][1]),1);if(raster.surface[y*320+x]===2&&o.ground.bridges.some(b=>x>=b.deck.x&&x<b.deck.x+b.deck.width&&y>=b.deck.y&&y<b.deck.y+b.deck.depth))crossings++;}
   const points=new Set();for(let time=0;time<200;time+=.25){const a=journeyAt(j,time);assert.equal(p.windows[a.point[1]*320+a.point[0]],1);points.add(a.point.join(','));}assert.ok(points.size>1);
  }
  assert.equal(JSON.stringify(world),before);
 }
 assert.ok(trips>0);assert.ok(crossings>0,'fixture must actually exercise a bridge crossing');
});
test('broken bridge journeys never traverse the span and abandoned facilities are not destinations',()=>{
 const o=observeGeneratedSceneReview(world,1000,0),objects=o.snapshot.objects.map(b=>b.kind==='bridge'||b.kind==='market'?{...b,condition:'ruined'}:b),changed={...o,snapshot:{...o.snapshot,objects}},p=planSceneMotion(changed);
 for(const j of p.journeys){assert.notEqual(objects.find(b=>b.id===j.targetId).condition,'ruined');for(const [x,y] of j.path)for(const b of o.ground.bridges)assert.ok(!(x>=b.deck.x+4&&x<b.deck.x+b.deck.width-4&&y>=b.deck.y&&y<b.deck.y+b.deck.depth));}
});
test('unbuilt facilities and uninhabited landscapes create no invented activity',()=>{
 const birth=observeGeneratedSceneReview(initial,0,0),p=planSceneMotion(birth);assert.equal(p.journeys.length,0);
 const o=observeGeneratedSceneReview(world,1000,0),empty=planSceneMotion({...o,composition:{...o.composition,population:0}});assert.equal(empty.journeys.length,0);assert.equal(empty.idle.length,0);assert.ok(empty.clouds.length>0);assert.equal(empty.smoke.length,0);
 assert.equal(sceneActivityCount(0,3),0);assert.ok(sceneActivityCount(500,0)<sceneActivityCount(50000,3));
});
test('render planning, wall-clock sampling and old observations never change the save or civilization',()=>{
 const before=createGeneratedWorldSave(world),past=observeGeneratedSceneReview(world,100,0),p=planSceneMotion(past);for(const j of p.journeys)for(const seconds of [0,1,19,50,500])assert.deepEqual(journeyAt(j,seconds),journeyAt(j,seconds));
 assert.deepEqual(createGeneratedWorldSave(world),before);assert.deepEqual(observeGeneratedSceneReview(world,100,0),past);
 const j={homeId:'home',targetId:'field',purpose:'field',path:[[0,100],[1,100],[2,100]],speed:1,rest:2,phase:0};assert.deepEqual(journeyAt(j,0).point,[0,100]);assert.deepEqual(journeyAt(j,4).point,[2,100]);assert.deepEqual(journeyAt(j,10).point,[0,100]);assert.throws(()=>journeyAt(j,NaN));assert.throws(()=>journeyAt(j,-1));
});
test('returned walk arrays cannot poison subsequent route reuse or bridge-state changes',()=>{
 const o=observeGeneratedSceneReview(world,1000,0),first=planSceneMotion(o),expected=first.windows.slice();first.windows.fill(0);assert.deepEqual(planSceneMotion(o).windows,expected);
 const broken={...o,snapshot:{...o.snapshot,objects:o.snapshot.objects.map(b=>b.kind==='bridge'?{...b,condition:'ruined'}:b)}};assert.notDeepEqual(planSceneMotion(broken).windows,expected);assert.deepEqual(planSceneMotion(o).windows,expected);
});
