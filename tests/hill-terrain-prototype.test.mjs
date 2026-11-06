import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {generateHillPrototype,hillVariants,hillVariantForSeed,terrainHash,rasterizeHill,reviewHillPlot,hillAccess,probeHillInitialPlots} from '../dist/terrain/hill-prototype.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';

test('hill hash and generation are deterministic, normalized and namespace separated',()=>{
 assert.equal(terrainHash(['a','bc']),terrainHash(['a','bc']));
 assert.notEqual(terrainHash(['a','bc']),terrainHash(['ab','c']));
 assert.equal(terrainHash([]),1947474976);
 assert.equal(terrainHash(['a','bc']),905245030);
 assert.equal(terrainHash(['hill-prototype-v1',42,'hills','hill-side','H01',0,'offset']),2764062234);
 assert.deepEqual(generateHillPrototype(0),generateHillPrototype(1));
 assert.throws(()=>generateHillPrototype(1,'H99'));
 assert.throws(()=>generateHillPrototype(1,'H01',32));
 const variants=new Set();
 for(let seed=1;seed<=1000;seed++){
  variants.add(hillVariantForSeed(seed));
  assert.deepEqual(generateHillPrototype(seed),generateHillPrototype(seed));
 }
 assert.equal(variants.size,8);
});

test('eight hill families keep distinct physical geometry and valid integer profiles',()=>{
 const hashes=new Set();
 for(const variant of hillVariants){
  const terrain=generateHillPrototype(42,variant),r=rasterizeHill(terrain);
  hashes.add(createHash('sha256').update(r.elevation).update(r.bearing).digest('hex'));
  const other=rasterizeHill(generateHillPrototype(7,variant));
  assert.notDeepEqual(r.elevation,other.elevation,'seed variation '+variant);
  for(const s of terrain.shapes){
   assert.ok(s.polygon.length>=3);
   for(const [x,y] of s.polygon)assert.ok(Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&x<=320&&y>=96&&y<=180);
   if(s.profile){
    const axis=s.profile.axis==='x'?0:1,values=s.polygon.map(p=>p[axis]);
    assert.ok(s.profile.knots[0][0]<=Math.min(...values));
    assert.ok(s.profile.knots.at(-1)[0]>=Math.max(...values));
    for(let i=1;i<s.profile.knots.length;i++)assert.ok(s.profile.knots[i][0]>s.profile.knots[i-1][0]);
   }
  }
  assert.ok(r.grade.some(v=>v===2));assert.ok(r.elevation.some(v=>v>0));
  assert.equal(reviewHillPlot(r,{x:0,y:95,width:18,depth:7}),'outside-ground');
  const plan=probeHillInitialPlots(r);assert.ok(plan,variant);
  assert.equal(reviewHillPlot(r,plan.house),'clear');assert.equal(reviewHillPlot(r,plan.field),'clear');
  const access=hillAccess(r,[plan.house,plan.field]);
  const entrance=p=>(p.y+p.depth)*320+p.x+Math.floor((p.width-2)/2);
  const root=plan.root[1]*320+plan.root[0];
  assert.equal(access.component[entrance(plan.house)],access.component[root]);
  assert.equal(access.component[entrance(plan.field)],access.component[root]);
 }
 assert.equal(hashes.size,8);
});

test('2x2 access rejects a 1px neck and diagonal contact; 2px width connects',()=>{
 const r={width:320,height:180,elevation:new Uint8Array(57600),grade:new Uint8Array(57600),bearing:new Uint8Array(57600)};
 r.bearing.fill(2);
 const clear=(x,y,w,h)=>{for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)r.bearing[(y+dy)*320+x+dx]=0;};
 clear(0,110,10,10);clear(15,110,10,10);clear(10,114,5,1);
 let a=hillAccess(r);assert.notEqual(a.component[112*320+2],a.component[112*320+17]);
 clear(10,115,5,1);a=hillAccess(r);assert.equal(a.component[112*320+2],a.component[112*320+17]);
 r.bearing.fill(2);clear(10,110,4,4);clear(14,114,4,4);a=hillAccess(r);
 assert.notEqual(a.component[110*320+10],a.component[114*320+14]);
});

test('hill diagnostics do not consume civilization randomness or change history',()=>{
 const a=createCivilization(42),b=createCivilization(42);
 for(let year=0;year<100;year++){
  const t=generateHillPrototype(year+1);probeHillInitialPlots(rasterizeHill(t));
  step(a);step(b);if(a.pending)chooseAutomatically(a);if(b.pending)chooseAutomatically(b);
 }assert.deepEqual(a,b);
});
