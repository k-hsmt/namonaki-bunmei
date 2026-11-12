/** Issue #47 B1b — unit checks for the independently-rendered visual comparison. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expressiveCatalog,renderExpressivePlant} from '../scripts/lib/expressive-plant-prototype.mjs';
import * as Claude from '../scripts/lib/plant-prototype.mjs';
import {REVIEW_BIOMES,REVIEW_STYLES,REVIEW_SITES,EXPRESSIVE_IDS,planReviewPlants,nearFreshwater} from '../scripts/lib/biome47-b1b-spec.mjs';

const fixture=()=>{
 const surface=new Uint8Array(320*180),grade=new Uint8Array(320*180),bearing=new Uint8Array(320*180);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)surface[y*320+x]=1;
 for(let y=105;y<178;y++)for(let x=10;x<14;x++)surface[y*320+x]=2; // genuine freshwater
 for(let y=105;y<178;y++)for(let x=300;x<305;x++)surface[y*320+x]=3; // genuine sea
 return {surface,grade,bearing};
};
const opaque=r=>{let n=0;for(let i=3;i<r.data.length;i+=4)n+=r.data[i]!==0;return n;};

test('B1b: both original B1a painters supply all 13 distinct archetypes with nonempty sprites',()=>{
 assert.equal(expressiveCatalog.length,13);
 assert.equal(new Set(expressiveCatalog.map(x=>x.id)).size,13);
 assert.equal(Object.keys(Claude.archetypes).length,13);
 assert.equal(Object.keys(EXPRESSIVE_IDS).length,13);
 for(const [claudeId,expressiveId] of Object.entries(EXPRESSIVE_IDS)){
  assert.ok(Claude.archetypes[claudeId]);
  assert.ok(expressiveCatalog.some(x=>x.id===expressiveId));
  for(const stage of ['young','mature']){
   const a=renderExpressivePlant(expressiveId,{stage});
   const b=Claude.renderPlant(claudeId,{stage,variant:2});
   assert.deepEqual([a.width,a.height,b.width,b.height],[72,64,96,72],claudeId);
   assert.ok(opaque(a)>0&&opaque(b)>0,claudeId);
   assert.equal(renderExpressivePlant(expressiveId,{stage}).mask(),a.mask(),'expressive sprite determinism');
  }
 }
});
test('B1b: test-only recipes enumerate exactly 7 biomes, 3 styles, 3 actual site IDs',()=>{
 assert.equal(REVIEW_BIOMES.length,7);assert.equal(REVIEW_STYLES.length,3);assert.equal(REVIEW_SITES.length,3);
 assert.deepEqual(REVIEW_SITES.map(x=>x.id),['river-bank','hill-side','coast-inlet']);
 assert.equal(new Set(REVIEW_BIOMES.map(x=>x.id)).size,7);
 assert.equal(new Set(REVIEW_STYLES.map(x=>x.id)).size,3);
});
test('B1b: terrain mask treats freshwater as distinct from sea',()=>{
 const r=fixture();
 assert.equal(nearFreshwater(r,20,130),true);
 assert.equal(nearFreshwater(r,291,130),false);
});
test('B1b: forest, desert and tundra planting use actual habitable land, ignore occupied plots, remain deterministic',()=>{
 const physics=fixture(),occupied=[{x:80,y:113,width:60,depth:30},{x:170,y:140,width:15,depth:20}];
 const original=Uint8Array.from(physics.surface);
 for(const biome of REVIEW_BIOMES){
  const args={physics,occupied,seed:88,siteIndex:0,biomeId:biome.id};
  const p=planReviewPlants(args);
  assert.deepEqual(p,planReviewPlants(args));
  assert.ok(p.counts.low>0,biome.id);
  assert.ok(p.counts.trees<=biome.trees&&p.counts.low<=biome.low);
  if(biome.id==='tundra')assert.equal(p.counts.trees,0);
  for(const plant of [...p.low,...p.trees]){
   const i=plant.y*320+plant.x;
   assert.equal(physics.surface[i],1);
   assert.equal(physics.bearing[i],0);
   assert.ok(plant.x>=1&&plant.x<319&&plant.y>=98&&plant.y<179);
   for(const plot of occupied){
    assert.ok(plant.x<plot.x-4||plant.x>=plot.x+plot.width+4||plant.y<plot.y-4||plant.y>=plot.y+plot.depth+4);
   }
   if(plant.id==='riparian')assert.equal(plant.fresh,true,'no coastal faux river trees');
  }
 }
 assert.deepEqual(physics.surface,original,'planner must not mutate saved world physics');
});
test('B1b: prototype modules are independent of actual production and never call Math.random',()=>{
 for(const file of ['../scripts/lib/biome47-b1b-spec.mjs','../scripts/lib/expressive-plant-prototype.mjs','../scripts/preview-biome-scenes.mjs']){
  const text=readFileSync(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(text,/Math\.random\s*\(|Date\.now\s*\(/);
 }
 assert.throws(()=>planReviewPlants({physics:fixture(),occupied:[],seed:88,siteIndex:0,biomeId:'ocean'}),/Unknown review biome/);
 assert.throws(()=>renderExpressivePlant('not-a-plant'),/Unknown expressive plant/);
 assert.throws(()=>renderExpressivePlant('deciduous',{stage:'old'}),/Invalid expressive stage/);
});
test('B1b: frames draw confirmed structures before plants (occlusion trial), never plants under structures by default',()=>{
 // The pixel-level proof runs in the browser over all 63 frames (scripts/preview-biome-scenes.mjs verify()).
 // This guard keeps npm test failing if the default order is reverted.
 const text=readFileSync(new URL('../scripts/preview-biome-scenes.mjs',import.meta.url),'utf8');
 const compose=text.slice(text.indexOf('const compose='),text.indexOf('const pixels='));
 assert.match(compose,/order='structures-under-plants'/,'default order changed');
 const current=compose.slice(compose.indexOf("if(order==='structures-under-plants')"),compose.indexOf("else if(order==='plants-under-structures')"));
 assert.ok(current.indexOf('scenes[si].buildings')>-1&&current.indexOf('layer.all')>current.indexOf('scenes[si].buildings'),'plants must be drawn after structures');
 assert.ok(compose.indexOf('ground(si,biome)')<compose.indexOf('scenes[si].buildings'),'soil tint must be applied before structures');
 assert.doesNotMatch(text,/Draw confirmed structures over the prototype canopy/);
 const verify=text.slice(text.indexOf('const verify='),text.indexOf('const frames=[]'));
 assert.match(verify,/is not the plant \(plants must be in front\)/);
 assert.match(verify,/structures vanished from the frame/);
});
test('B1b: plants and soil tint follow the saved scene mirror; the planner stays in record coordinates',()=>{
 // The mapping is checked against the real canvas transform, and every root against land, while rendering.
 const text=readFileSync(new URL('../scripts/preview-biome-scenes.mjs',import.meta.url),'utf8');
 assert.match(text,/const screenColumn=\(si,x\)=>scenes\[si\]\.mirrorX\?319-x:x;/);
 assert.match(text,/const screenRoot=\(si,x\)=>scenes\[si\]\.mirrorX\?318-x:x;/);
 assert.match(text,/left=Math\.round\(screenRoot\(si,plant\.x\)-ox\*k\)/,'plant roots must be mapped to screen');
 assert.match(text,/const z=y\*320\+screenColumn\(si,x\);/,'tint must read the mirrored record column');
 assert.match(text,/Mirror mapping disagrees with the canvas transform/);
 assert.match(text,/Plant root drawn off land/);
});
