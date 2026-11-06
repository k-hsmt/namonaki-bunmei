import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {coastVariants,generateCoastPrototype,rasterizeCoast,coastWaterConnected,probeCoastInitialPlots,reviewCoastPlot} from '../dist/terrain/coast-prototype.js';
import {mountainVariants,generateMountainPrototype,projectMountainPrototype} from '../dist/terrain/mountain-prototype.js';
import {generateWorldPrototype,compatiblePrototypeVariants,prototypeSites,displayedPlot,displayedPoint} from '../dist/terrain/world-prototype.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';

test('8 coasts have distinct water masks, sea ports, initial ground and immutable JSON roundtrip',()=>{
 const masks=new Set();
 for(const v of coastVariants)for(const seed of [7,42,82]){
  const t=generateCoastPrototype(seed,v),before=JSON.stringify(t),r=rasterizeCoast(t);
  assert.ok(coastWaterConnected(r),v+' '+seed);
  assert.ok(coastWaterConnected(r,true),'freshwater to sea '+v+' '+seed);
  assert.ok(probeCoastInitialPlots(r));
  const plan=probeCoastInitialPlots(r);
  assert.equal(reviewCoastPlot(r,plan.house),'clear');assert.equal(reviewCoastPlot(r,plan.field),'clear');
  assert.equal(reviewCoastPlot(r,{x:319,y:100,width:18,depth:7}),'outside-ground');
  assert.deepEqual(rasterizeCoast(JSON.parse(before)),r);assert.equal(JSON.stringify(t),before);
  if(seed===42)masks.add(createHash('sha256').update(r.surface).update(r.bearing).digest('hex'));
  if(v==='C07')assert.ok(r.bearing.some(x=>x===1));
  if(v==='C08')assert.ok(r.bearing.some(x=>x===2));
  if(v==='C06'){
   assert.ok(r.surface.some(x=>x===2));
   assert.equal(generateCoastPrototype(seed,v,2).freshwater.length,2);
  }
 }assert.equal(masks.size,8);
 assert.throws(()=>generateCoastPrototype(1,'C99'));
});

test('6 mountain families project the same landmark IDs into all 3 views',()=>{
 const profiles=new Set();
 for(const v of mountainVariants){
  const t=generateMountainPrototype(42,v);profiles.add(JSON.stringify(t.landmarks.map(x=>x.height)));
  const views=prototypeSites.map(s=>projectMountainPrototype(t,s));
  for(const p of views){
   assert.deepEqual(p.landmarks.map(x=>x.id),t.landmarks.map(x=>x.id));
   assert.ok(Math.min(...p.landmarks.map(l=>l.point[1]))<=72);
   for(const l of p.landmarks)assert.ok(l.point[0]>=0&&l.point[0]<=320&&l.point[1]>=48&&l.point[1]<=90);
  }
  assert.notDeepEqual(views[0].landmarks,views[2].landmarks);
  if(v==='M05')assert.equal(views[0].layers.length,2);
 }assert.equal(profiles.size,6);assert.throws(()=>generateMountainPrototype(1,'M99'));
});

test('watershed generation preserves compatibility, visible ports and screen transforms',()=>{
 const sides=new Set();
 for(let seed=1;seed<=64;seed++){
  const result=generateWorldPrototype(seed);assert.equal(result.status,'ok',String(seed));const w=result.world;
  sides.add(w.seaSide);assert.ok(compatiblePrototypeVariants(w.river.variant,w.hill.variant,w.coast.variant));
  assert.deepEqual(generateWorldPrototype(seed),result);
  assert.deepEqual(JSON.parse(JSON.stringify(w)),w);
  for(const site of prototypeSites){
   const p={x:21,y:112,width:18,depth:7};const shown=displayedPlot(w,site,p);
   assert.equal(shown.x,w.seaSide==='west'?281:21);
   assert.deepEqual(displayedPoint(w,site,[12,110]),w.seaSide==='west'?[307,110]:[12,110]);
   assert.ok(w.views[site].mountains.landmarks.length>0);
  }
  const cr=rasterizeCoast(w.coast);
  for(const p of w.ports){
   if(!p.visible){assert.equal(p.point,null);continue;}
   assert.ok(p.point);
   if(p.site==='coast-inlet')assert.equal(cr.surface[p.point[1]*320+p.point[0]],2);
  }
  if(w.river.variant==='confluence')assert.equal(w.ports.filter(p=>p.site==='river-bank'&&p.flow==='in').length,2);
  if(w.river.variant==='distributary')assert.equal(w.ports.filter(p=>p.site==='river-bank'&&p.flow==='out').length,2);
  assert.ok(w.initialPlots.hill&&w.initialPlots.river&&w.initialPlots.coast);
 }assert.equal(sides.size,2);
 assert.equal(compatiblePrototypeVariants('braided-channels','H08','C08'),false);
 assert.deepEqual(generateWorldPrototype(0),generateWorldPrototype(1));
});

test('world generation never mutates civilization RNG, history or pending choices',()=>{
 const a=createCivilization(42),b=createCivilization(42);
 for(let i=0;i<30;i++){
  generateWorldPrototype(i+1);step(a);step(b);if(a.pending)chooseAutomatically(a);if(b.pending)chooseAutomatically(b);
 }assert.deepEqual(a,b);
});
