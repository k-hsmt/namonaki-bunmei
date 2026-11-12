/** Issue #47 B1b — unit checks for the independently-rendered visual comparison. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expressiveCatalog,renderExpressivePlant} from '../scripts/lib/expressive-plant-prototype.mjs';
import * as Claude from '../scripts/lib/plant-prototype.mjs';
import {REVIEW_BIOMES,REVIEW_STYLES,REVIEW_SITES,EXPRESSIVE_IDS,MIXED_UNDERGROWTH_SCALE,FOREST_BIOMES,FOREST_DENSITIES,DEFAULT_FOREST_DENSITY,planReviewPlants,nearFreshwater,mixedPainter} from '../scripts/lib/biome47-b1b-spec.mjs';

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
test('B1b: test-only recipes enumerate exactly 7 biomes, 4 styles, 3 actual site IDs',()=>{
 assert.equal(REVIEW_BIOMES.length,7);assert.equal(REVIEW_STYLES.length,4);assert.equal(REVIEW_SITES.length,3);
 assert.deepEqual(REVIEW_SITES.map(x=>x.id),['river-bank','hill-side','coast-inlet']);
 assert.equal(new Set(REVIEW_BIOMES.map(x=>x.id)).size,7);
 assert.equal(new Set(REVIEW_STYLES.map(x=>x.id)).size,4);
 assert.deepEqual(REVIEW_STYLES.map(x=>x.id),['expressive','claude','hybrid','mixed']);
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
  const cap=biome.trees*(FOREST_BIOMES.includes(biome.id)?FOREST_DENSITIES[DEFAULT_FOREST_DENSITY].treeFactor:1);
  assert.ok(p.counts.trees<=cap&&p.counts.low<=biome.low,biome.id);
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
test('B1b: plants and structures are ordered by ground-line Y, structure-to-structure order stays the game\'s',()=>{
 // The pixel-level proof runs in the browser over all 84 frames and the front/behind overlap checks
 // (scripts/preview-biome-scenes.mjs verify()). This guard keeps npm test failing if the order is reverted.
 const text=readFileSync(new URL('../scripts/preview-biome-scenes.mjs',import.meta.url),'utf8');
 const compose=text.slice(text.indexOf('const compose='),text.indexOf('const verify='));
 assert.match(compose,/order='y-sorted'/,'default order changed');
 const ysorted=compose.slice(compose.indexOf("if(order==='y-sorted')"),compose.indexOf("else if(order==='structures-under-plants')"));
 assert.ok(ysorted.indexOf('s.behind')<ysorted.indexOf('scenes[si].buildings')&&ysorted.indexOf('scenes[si].buildings')<ysorted.indexOf('s.front'),
  'plants behind, then the structure layer, then plants in front');
 assert.match(text,/const inFront=\(si,layer,i\)=>layer\.root\[i\]>scenes\[si\]\.depthMap\[i\];/,'ties must keep the structure in front');
 assert.match(text,/ground:plot\.y\+plot\.depth/,'facility ground line is the footprint front edge');
 assert.match(text,/Single-structure renders do not reproduce the structure layer/);
 assert.match(text,/a\.y-b\.y\|\|Number\(a\.kind==='tree'\)-Number\(b\.kind==='tree'\)/,'plants sorted together by root y');
 const verify=text.slice(text.indexOf('const verify='),text.indexOf('const frames=[]'));
 assert.match(verify,/is not the plant in front/);
 assert.match(verify,/a plant behind it shows through/);
 assert.match(verify,/structures vanished from the frame/);
 assert.match(text,/the structure did not hide the tree behind it/);
 assert.match(text,/the tree in front did not cover the structure/);
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
test('B1b D: each plant gets A or B from a fixed hash, about half and half, and A undergrowth is scaled 0.6',()=>{
 const physics=fixture(),seen={expressive:0,claude:0};
 for(const biome of REVIEW_BIOMES)for(let siteIndex=0;siteIndex<3;siteIndex++){
  const plan=planReviewPlants({physics,occupied:[],seed:88,siteIndex,biomeId:biome.id});
  for(const plant of [...plan.trees,...plan.low]){
   const a=mixedPainter(88,siteIndex,plant);
   assert.ok(a==='expressive'||a==='claude');
   assert.equal(mixedPainter(88,siteIndex,{...plant}),a,'deterministic');
   seen[a]++;
  }
 }
 const total=seen.expressive+seen.claude,share=seen.expressive/total;
 assert.ok(total>300&&share>.4&&share<.6,'split '+JSON.stringify(seen));
 assert.equal(MIXED_UNDERGROWTH_SCALE,0.6);
 assert.throws(()=>mixedPainter(88,0,{}),/planned root/);
 const text=readFileSync(new URL('../scripts/preview-biome-scenes.mjs',import.meta.url),'utf8');
 assert.match(text,/style\.id==='mixed'&&plant\.mix==='expressive'/);
 assert.match(text,/style\.id==='mixed'&&expressive&&plant\.kind==='low'\?mixedUndergrowthScale:1/);
});
test('B1b forest density: only forests change; denser presets add trees with the stated spacing and building margins',()=>{
 const physics=fixture(),occupied=[{x:80,y:113,width:60,depth:30},{x:170,y:140,width:15,depth:20}];
 assert.equal(DEFAULT_FOREST_DENSITY,'medium');
 assert.deepEqual(Object.keys(FOREST_DENSITIES),['baseline','medium','dense']);
 assert.deepEqual([...FOREST_BIOMES],['temperate_forest','tropical_rainforest','boreal_forest']);
 for(const biome of REVIEW_BIOMES){
  const plan=d=>planReviewPlants({physics,occupied,seed:88,siteIndex:1,biomeId:biome.id,forestDensity:d});
  if(!FOREST_BIOMES.includes(biome.id)){
   for(const d of ['medium','dense'])assert.deepEqual(plan(d),plan('baseline'),biome.id+' must not depend on forest density');
   assert.equal(plan('dense').forestDensity,'baseline');
   continue;
  }
  const counts=['baseline','medium','dense'].map(d=>plan(d).counts.trees);
  assert.ok(counts[0]<counts[1]&&counts[1]<counts[2],biome.id+' '+counts);
  for(const [d,preset] of Object.entries(FOREST_DENSITIES)){
   const p=plan(d);
   assert.ok(p.counts.trees<=biome.trees*preset.treeFactor);
   for(let i=0;i<p.trees.length;i++)for(let j=i+1;j<p.trees.length;j++){
    const a=p.trees[i],b=p.trees[j];assert.ok((a.x-b.x)**2+(a.y-b.y)**2>=preset.treeSpacing**2,biome.id+'/'+d+' spacing');
   }
   for(const t of p.trees)for(const o of occupied)
    assert.ok(t.x<o.x-preset.structureMarginX||t.x>=o.x+o.width+preset.structureMarginX||t.y<o.y-preset.structureMarginY||t.y>=o.y+o.depth+preset.structureMarginY,biome.id+'/'+d+' building margin');
   for(const q of [...p.trees,...p.low])for(const o of occupied)
    assert.ok(q.x<o.x-4||q.x>=o.x+o.width+4||q.y<o.y-4||q.y>=o.y+o.depth+4,'no plant inside a plot or its 4px ring');
  }
 }
 assert.throws(()=>planReviewPlants({physics,occupied,seed:88,siteIndex:0,biomeId:'boreal_forest',forestDensity:'jungle'}),/Unknown forest density/);
});
