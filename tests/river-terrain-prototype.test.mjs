import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRiverPrototype,legacyRiverReference,prototypeWaterAt,reviewPrototypePlot,pointInPolygon} from '../dist/terrain/river-prototype.js';
import {isUnoccupiedGround} from '../dist/scene/housing-ground.js';
import {createHousingCivilization,serializeHousingSave} from '../dist/story/housing-persistence.js';

test('#31: seedから河川3種を再現し、同じ種でも形状が変わる',()=>{
 const examples=[7,42,82].map(generateRiverPrototype);
 assert.equal(new Set(examples.map(t=>t.variant)).size,3);
 for(const t of examples){
  assert.deepEqual(generateRiverPrototype(t.seed),t);
  assert.deepEqual(JSON.parse(JSON.stringify(t)),t);
  assert.equal(t.status,'prototype-only');
  for(const p of t.water.flat())assert.ok(p[0]>=0&&p[0]<=320&&p[1]>=95&&p[1]<=180);
 }
 const shapes=new Map();
 for(let seed=1;seed<=100;seed++){
  const t=generateRiverPrototype(seed),set=shapes.get(t.variant)??new Set();
  set.add(JSON.stringify(t.water));shapes.set(t.variant,set);
  for(const island of t.islands)for(const [x,y] of island)
   assert.ok(t.water.some(p=>pointInPolygon(x,y,p)),'中州の頂点が河道の外へはみ出ない: seed '+seed);
 }
 for(const set of shapes.values())assert.ok(set.size>1,'固定の3枚を選ぶだけではない');
 for(const invalid of [-1,1.5,NaN,Infinity,2**32])assert.throws(()=>generateRiverPrototype(invalid),/seed/);
});
test('#31: 旧河川の参照マスクは既存の地表ゲートと一致する',()=>{
 const t=legacyRiverReference();
 for(let y=95;y<180;y++)for(let x=0;x<320;x++)
  assert.equal(prototypeWaterAt(t,x+.5,y+.5),!isUnoccupiedGround({x,y,width:1,depth:1},[],[],0));
 assert.equal(reviewPrototypePlot(t,{x:5,y:155,width:12,depth:6}).status,'land');
 assert.equal(reviewPrototypePlot(t,{x:148,y:106,width:4,depth:4}).reason,'water');
 assert.equal(reviewPrototypePlot(t,{x:310,y:170,width:20,depth:20}).reason,'boundary');
});
test('#31: 中州は外側の河道内の陸地として残り、水面を建設可能扱いしない',()=>{
 const t=generateRiverPrototype(7);assert.equal(t.variant,'island-channels');
 let island=0,water=0;
 for(let y=95;y<180;y++)for(let x=0;x<320;x++){
  if(t.islands.some(p=>pointInPolygon(x+.5,y+.5,p))){
   assert.ok(t.water.some(p=>pointInPolygon(x+.5,y+.5,p)),'島が河道の外へはみ出ない');
   assert.equal(prototypeWaterAt(t,x+.5,y+.5),false);island++;
  }
  if(prototypeWaterAt(t,x+.5,y+.5)){
   assert.equal(reviewPrototypePlot(t,{x,y,width:1,depth:1}).reason,'water');water++;
  }
 }
 assert.ok(island>50);assert.ok(water>500);
});
test('#31: 試作から既存の保存・乱数・地形を変更しない',()=>{
 const state=createHousingCivilization(42),before=serializeHousingSave(state);
 const reference=legacyRiverReference();reference.water[0][0][0]=0;
 assert.equal(legacyRiverReference().water[0][0][0],131,'参照は呼び出しごとに独立');
 for(const seed of [7,42,82])generateRiverPrototype(seed);
 assert.equal(serializeHousingSave(state),before);
});
