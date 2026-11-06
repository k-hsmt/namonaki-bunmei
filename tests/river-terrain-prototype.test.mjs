import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRiverPrototype,legacyRiverReference,prototypeWaterAt,reviewPrototypePlot,pointInPolygon,riverVariants,riverPrototypeExamples} from '../dist/terrain/river-prototype.js';
import {isUnoccupiedGround} from '../dist/scene/housing-ground.js';
import {createHousingCivilization,serializeHousingSave} from '../dist/story/housing-persistence.js';

test('#31: seedから河川10系統を再現し、同じ系統でも形状が変わる',()=>{
 const examples=riverPrototypeExamples();
 assert.equal(riverVariants.length,10);
 assert.deepEqual(examples.map(t=>t.variant),riverVariants);
 for(const t of examples){
  assert.deepEqual(generateRiverPrototype(t.seed),t);
  assert.deepEqual(JSON.parse(JSON.stringify(t)),t);
  assert.equal(t.status,'prototype-only');
  for(const p of t.water.flat())assert.ok(p[0]>=0&&p[0]<=320&&p[1]>=95&&p[1]<=180);
 }
 const shapes=new Map();
 for(let seed=1;seed<=1000;seed++){
  const t=generateRiverPrototype(seed),set=shapes.get(t.variant)??new Set();
  set.add(JSON.stringify(t.water));shapes.set(t.variant,set);
  for(const island of t.islands)for(const [x,y] of island)
   assert.ok(t.water.some(p=>pointInPolygon(x,y,p)),'中州の頂点が河道の外へはみ出ない: seed '+seed);
 }
 assert.equal(shapes.size,10);
 for(const set of shapes.values())assert.ok(set.size>1,'固定の10枚を選ぶだけではない');
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
 const t=riverPrototypeExamples().find(t=>t.variant==='island-channels');
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
function mask(t){
 const result=new Uint8Array(320*85);
 for(let y=0;y<85;y++)for(let x=0;x<320;x++)result[y*320+x]=Number(prototypeWaterAt(t,x+.5,y+95.5));
 return result;
}
function runs(pixels,row){
 let n=0,prior=0;
 for(let x=0;x<320;x++){const next=pixels[row*320+x];if(next&&!prior)n++;prior=next;}
 return n;
}
function components(pixels,value,interiorOnly=false){
 const seen=new Uint8Array(pixels.length);let count=0;
 for(let i=0;i<pixels.length;i++){
  if(seen[i]||pixels[i]!==value)continue;
  const queue=[i];seen[i]=1;let boundary=false;
  for(let k=0;k<queue.length;k++){
   const at=queue[k],x=at%320,y=Math.floor(at/320);
   if(x===0||x===319||y===0||y===84)boundary=true;
   for(const next of [x>0?at-1:-1,x<319?at+1:-1,y>0?at-320:-1,y<84?at+320:-1]){
    if(next>=0&&!seen[next]&&pixels[next]===value){seen[next]=1;queue.push(next);}
   }
  }
  if(!interiorOnly||!boundary)count++;
 }
 return count;
}
test('#31: 合流・分流・網状流・1島と2島を水面マスクで区別できる',()=>{
 const masks=new Map(riverPrototypeExamples().map(t=>[t.variant,mask(t)]));
 assert.equal(new Set([...masks.values()].map(m=>Buffer.from(m).toString('base64'))).size,10);
 for(const [name,m] of masks)assert.equal(components(m,1),1,name+' の河道が途中で切断されない');
 assert.equal(runs(masks.get('confluence'),0),2,'合流は上流側に2河道');
 assert.equal(runs(masks.get('confluence'),84),1,'合流は下流側に1河道');
 assert.equal(runs(masks.get('distributary'),0),1,'分流は上流側に1河道');
 assert.equal(runs(masks.get('distributary'),84),2,'分流は下流側に2河道');
 assert.equal(runs(masks.get('braided-channels'),132-95),3,'網状流は中ほどで3河道に分かれる');
 assert.equal(components(masks.get('island-channels'),0,true),1,'1つの中州');
 assert.equal(components(masks.get('twin-islands'),0,true),2,'2つの独立した中州');
});
test('#31: 試作から既存の保存・乱数・地形を変更しない',()=>{
 const state=createHousingCivilization(42),before=serializeHousingSave(state);
 const reference=legacyRiverReference();reference.water[0][0][0]=0;
 assert.equal(legacyRiverReference().water[0][0][0],131,'参照は呼び出しごとに独立');
 for(const seed of [7,42,82])generateRiverPrototype(seed);
 assert.equal(serializeHousingSave(state),before);
});
