/** Issue #38 D1a: controlled sprite test; no real animal population or habitat is asserted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Raster} from '../scripts/lib/pixel-raster.mjs';
import {FAUNA_D1A_RULE,WIDTH,HEIGHT,SPECIES,STYLES,DEPTHS,FRAMES,ANIM_CYCLE,
  ANIM_STARTS,frameOf,drawAnimalSprite,animalBounds,referenceStage,renderFaunaD1a} from '../scripts/lib/fauna38-d1a.mjs';

test('D1a spec: exactly 6 wild animal groups, 2 silhouettes, 3 depths and 8 poses',()=>{
 assert.equal(SPECIES.length,6);assert.equal(STYLES.length,2);assert.equal(DEPTHS.length,3);assert.equal(FRAMES.length,8);
 assert.equal(new Set(SPECIES.map(s=>s.id)).size,6);
 assert.ok(SPECIES.every(s=>s.id!=='cow'&&s.id!=='chicken'&&!s.category.includes('家畜')));
 assert.equal(FAUNA_D1A_RULE,'fauna-d1a-controlled-sprites-v1');
});
test('D1a pure frame clock: stops and loops without RNG',()=>{
 assert.equal(frameOf(0),0);assert.equal(frameOf(4.2),2);assert.equal(frameOf(8.5),5);
 assert.equal(frameOf(ANIM_CYCLE),0);
 assert.equal(frameOf(ANIM_CYCLE+8.5),5);
 assert.throws(()=>frameOf(-1));assert.throws(()=>frameOf(NaN));
 assert.ok(ANIM_STARTS.every((v,i)=>i===0||v>ANIM_STARTS[i-1]));
});
test('D1a source sprites are nonempty and all frames remain within logical canvas',()=>{
 for(const s of SPECIES)for(const style of STYLES)for(const frame of FRAMES){
  const sprite=drawAnimalSprite(s.id,style.id,frame);
  const b=animalBounds(sprite);
  assert.ok(b&&b.pixels>0,s.id+'/'+style.id+'/'+frame);
  assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=24&&b.y+b.height<=22);
 }
 assert.throws(()=>drawAnimalSprite('sheep','restrained',0));
 assert.throws(()=>drawAnimalSprite('deer','none',0));
 assert.throws(()=>drawAnimalSprite('deer','legible',9));
});
test('D1a stages use existing architecture grammar and 2x6 person reference',()=>{
 const stage=referenceStage('deer');
 assert.equal(stage.width,WIDTH);assert.equal(stage.height,HEIGHT);
 assert.equal(stage.data.length,320*180*4);
 for(let y=147;y<153;y++)assert.equal(stage.data[(y*320+214)*4+3],255);
 assert.equal(referenceStage('waterbird').data.length,stage.data.length);
});
test('D1a 288 native images: silhouettes differ, some frames move and are reproducible',()=>{
 let count=0;
 for(const s of SPECIES)for(const d of DEPTHS){
  const first=renderFaunaD1a({speciesId:s.id,styleId:'restrained',depthId:d.id,frame:0});
  const readable=renderFaunaD1a({speciesId:s.id,styleId:'legible',depthId:d.id,frame:0});
  const moving=renderFaunaD1a({speciesId:s.id,styleId:'restrained',depthId:d.id,frame:5});
  assert.notDeepEqual(first.raster.data,readable.raster.data,'Style not distinguishable: '+s.id+'/'+d.id);
  assert.notDeepEqual(first.raster.data,moving.raster.data,'Motion not distinguishable: '+s.id+'/'+d.id);
  for(const style of STYLES)for(const frame of FRAMES){
   const input={speciesId:s.id,styleId:style.id,depthId:d.id,frame};
   const a=renderFaunaD1a(input),b=renderFaunaD1a(input);
   assert.deepEqual(a.raster.data,b.raster.data);
   assert.equal(a.raster.png().readUInt32BE(16),320);
   assert.equal(a.raster.png().readUInt32BE(20),180);
   assert.ok(a.metrics.rendered>0);count++;
  }
 }
 assert.equal(count,288);
});
test('D1a uses no Math.random or simulation RNG',()=>{
 const rand=Math.random;Math.random=()=>{throw Error('No random in visual trial');};
 try{
  const a=renderFaunaD1a({speciesId:'deer',styleId:'legible',depthId:'near',frame:4});
  const b=renderFaunaD1a({speciesId:'deer',styleId:'legible',depthId:'near',frame:4});
  assert.deepEqual(a.raster.data,b.raster.data);
 }finally{Math.random=rand;}
});
