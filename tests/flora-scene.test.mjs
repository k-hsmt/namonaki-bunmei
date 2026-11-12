/** Issue #47 B2d: plants of a confirmed scene follow the world's flora, with the reviewed painters and planting. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {renderPlant} from '../scripts/lib/plant-prototype.mjs';
import {renderExpressivePlant} from '../scripts/lib/expressive-plant-prototype.mjs';
import {EXPRESSIVE_IDS} from '../scripts/lib/biome47-b1b-spec.mjs';
import {restrainedSprite,expressiveSprite} from '../dist/flora/plant-sprites-v1.js';
import {planFloraScene,renderFloraLayer,rasterizeFlora,composeFlora,treeSwayAt,plantScale,BIOME_SCENE,SCENE_DENSITY,LOW_SPACING,LOW_TREE_CLEARANCE,ROOT_MARGIN} from '../dist/flora/flora-scene-v1.js';
import {sceneOccupiedPlots} from '../dist/scene/flora-draw.js';
import {PLANT_ARCHETYPES,FLORA_SITES,describeFloraPatch} from '../dist/flora/local-flora-v1.js';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldFloraAt,worldStructurePainter} from '../dist/story/world-session.js';

const find=f=>{for(let s=1;s<5000;s++)if(f(generateClimateBaseline(s)))return s;throw Error('no seed');};
const seeds={desert:find(c=>c.dominantBiome==='desert'&&!c.transition),tundra:find(c=>c.dominantBiome==='tundra'&&!c.transition),forest:find(c=>c.dominantBiome==='temperate_forest'&&!c.transition)};
const worlds={};for(const [k,s] of Object.entries(seeds))worlds[k]=architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(s)).architecture,400,'automatic'));
const year=w=>w.review.environment.confirmedThrough;
const scene=(w,i)=>{const o=observeGeneratedWorldSession(w,year(w),i),site=FLORA_SITES[i],physics=readOwnedRecordPhysics(o.ground.terrain.sites[site].physics),occupied=sceneOccupiedPlots(o);
 const patches=w.flora.sites[site],views=worldFloraAt(w,year(w),i);
 return {o,site,physics,occupied,patches,views,plants:planFloraScene({seed:w.state.seed,site,patches,views,physics,occupied})};};
const land=(r,x,y)=>r.surface[y*320+x]===1&&r.grade[y*320+x]<2&&r.bearing[y*320+x]===0;

test('B2d: both painters are pixel-identical to the reviewed B1a/B1b sprites (13 forms, young and mature, 6 variants)',()=>{
 for(const id of PLANT_ARCHETYPES)for(const stage of ['young','mature']){
  for(let variant=0;variant<6;variant++)assert.deepEqual(Buffer.from(restrainedSprite(id,stage,variant).data),Buffer.from(renderPlant(id,{stage,variant}).data),'B '+id+' '+stage+' '+variant);
  assert.deepEqual(Buffer.from(expressiveSprite(id,stage).data),Buffer.from(renderExpressivePlant(EXPRESSIVE_IDS[id],{stage}).data),'A '+id+' '+stage);
 }
});

test('B2d: trees grow only where the flora has a young or mature stand of its canopy form; tundra has none',()=>{
 for(const [name,w] of Object.entries(worlds))for(let i=0;i<3;i++){
  const {plants,patches,views}=scene(w,i);
  for(const p of plants){
   const index=Math.floor((p.y-96)/8)*40+Math.floor(p.x/8),d=describeFloraPatch(patches[index]),v=views[index];
   assert.ok(v.stage>=1,'no plant on bare patches');
   if(p.kind==='tree'){assert.equal(p.id,d.canopy);assert.ok(v.stage>=3);assert.equal(p.stage,v.stage===3?'young':'mature');}
   else{assert.ok([d.shrub,d.herb].includes(p.id));if(v.stage===1)assert.equal(p.id,d.herb);}
  }
  if(name==='tundra')assert.equal(plants.filter(p=>p.kind==='tree').length,0);
 }
 const trees=w=>[0,1,2].map(i=>scene(w,i).plants.filter(p=>p.kind==='tree').length).reduce((a,b)=>a+b);
 assert.ok(trees(worlds.forest)>3*trees(worlds.desert),'a forest world shows many more trees than a desert');
});

test('B2d: roots stand on land, clear of structures, spaced as reviewed and within the biome caps',()=>{
 for(const w of Object.values(worlds))for(let i=0;i<3;i++){
  const {plants,physics,occupied,patches}=scene(w,i),trees=plants.filter(p=>p.kind==='tree'),low=plants.filter(p=>p.kind==='low');
  for(const p of plants){
   for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]])assert.ok(land(physics,p.x+dx,p.y+dy),'root on stable land');
   for(const o of occupied)assert.ok(!(p.x>=o.x-ROOT_MARGIN&&p.x<o.x+o.width+ROOT_MARGIN&&p.y>=o.y-ROOT_MARGIN&&p.y<o.y+o.depth+ROOT_MARGIN),'root clear of structures');
  }
  for(const [a,b] of low.flatMap((a,j)=>low.slice(j+1).map(b=>[a,b])))assert.ok((a.x-b.x)**2+(a.y-b.y)**2>=LOW_SPACING**2);
  for(const t of trees)for(const q of low)assert.ok((t.x-q.x)**2+(t.y-q.y)**2>=LOW_TREE_CLEARANCE**2);
  for(const [a,b] of trees.flatMap((a,j)=>trees.slice(j+1).map(b=>[a,b])))assert.ok((a.x-b.x)**2+(a.y-b.y)**2>=SCENE_DENSITY.forest.treeSpacing**2);
  const biomes=patches.filter(Boolean).map(p=>describeFloraPatch(p).biome);
  const cap=k=>Math.round(biomes.reduce((s,b)=>s+BIOME_SCENE[b][k]*(k==='trees'&&['temperate_forest','tropical_rainforest','boreal_forest'].includes(b)?3:1),0)/biomes.length);
  assert.ok(trees.length<=cap('trees')&&low.length<=cap('low'));
 }
 // Desert and tundra keep their shrubs sparse (B2c handoff: most of their patches stand at shrub stage).
 for(const [w,biome] of [[worlds.desert,'desert'],[worlds.tundra,'tundra']])for(let i=0;i<3;i++){
  const {plants,views}=scene(w,i),low=plants.filter(p=>p.kind==='low').length;
  assert.ok(low<=BIOME_SCENE[biome].low);assert.ok(views.filter(v=>v&&v.stage>=2).length>2*low,'only a few of the shrub patches show a plant');
 }
});

test('B2d: the plan and the A/B mix are deterministic; about half the plants use each painter; A undergrowth is 0.6×',()=>{
 let a=0,n=0;
 for(const w of Object.values(worlds))for(let i=0;i<3;i++){
  const first=scene(w,i).plants,again=scene(w,i).plants;assert.deepEqual(again,first);
  for(const p of first){n++;if(p.painter==='expressive')a++;}
 }
 assert.ok(n>100&&a/n>.35&&a/n<.65,'painter share '+a+'/'+n);
 const base={id:'shrub',x:100,y:138,stage:'mature',variant:0};
 assert.ok(Math.abs(plantScale({...base,kind:'low',painter:'expressive'})-plantScale({...base,kind:'tree',painter:'expressive'})*.6)<1e-12);
 assert.ok(Math.abs(plantScale({...base,kind:'low',painter:'restrained'})-(.58+.42*(138-96)/84))<1e-12);
});

test('B2d: plants are drawn by root y and follow the scene mirror without flipping the sprite',()=>{
 const plant={kind:'tree',id:'conifer',x:60,y:150,stage:'mature',variant:0,painter:'restrained'};
 const plain=renderFloraLayer([plant],false),mirrored=renderFloraLayer([plant],true);
 const columns=l=>{const xs=[];for(let i=0;i<57600;i++)if(l.root[i]>=0)xs.push(i%320);return [Math.min(...xs),Math.max(...xs)];};
 const [a0,a1]=columns(plain),[b0,b1]=columns(mirrored);
 assert.equal(b0-a0,(318-60)-60);assert.equal(b1-a1,(318-60)-60,'the same sprite, moved to the mirrored root');
 for(let i=0;i<57600;i++)if(plain.root[i]>=0)assert.equal(plain.root[i],150);
 // A nearer plant (larger root y) covers a farther one where they overlap, whatever the input order.
 const far={...plant,y:140,x:62},near=plant,l1=renderFloraLayer([near,far],false),l2=renderFloraLayer([far,near],false);
 assert.deepEqual(Buffer.from(l1.rgba),Buffer.from(l2.rgba));
 let overlap=0;for(let i=0;i<57600;i++)if(l1.root[i]===150&&renderFloraLayer([far],false).root[i]===140)overlap++;
 assert.ok(overlap>0);
});

test('B2d: the v10 painter carries the world flora of the observed year and site; cached per observation',()=>{
 const w=worlds.forest,painter=worldStructurePainter(w),o=observeGeneratedWorldSession(w,year(w),1),f=painter.flora(o);
 assert.equal(f.seed,w.state.seed);assert.equal(f.patches,w.flora.sites['hill-side']);assert.deepEqual(f.views,worldFloraAt(w,year(w),1));
 assert.equal(painter.flora(o),f,'cached per observation');
});

test('B2d: plant drawing uses no random source and is not read by civilisation code',()=>{
 for(const f of ['src/flora/flora-scene-v1.ts','src/flora/plant-sprites-v1.ts','src/scene/flora-draw.ts'])
  assert.doesNotMatch(readFileSync(f,'utf8'),/Math\.random|Date\.now|performance\.now|new Date/,f);
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 for(const file of walk('src').filter(f=>/\/(story|irrigation|terrain|architecture|engine|environment|vegetation|climate)\//.test(f)&&!f.endsWith('world-session.ts')))
  assert.doesNotMatch(readFileSync(file,'utf8'),/flora\/(flora-scene-v1|plant-sprites-v1)|scene\/flora-draw/,file+' must not read plant drawing');
});

test('B2d: a swaying tree moves only its crown, by one pixel, and undergrowth stays still',()=>{
 const tree={kind:'tree',id:'deciduous',x:100,y:150,stage:'mature',variant:0,painter:'restrained'},grass={kind:'low',id:'herb',x:140,y:150,stage:'mature',variant:0,painter:'restrained'};
 const r=rasterizeFlora([tree,grass],false),still=composeFlora(r),left=composeFlora(r,[-1]);
 assert.equal(r.trees,1);
 const rows=l=>{const m=new Map();for(let i=0;i<57600;i++)if(l.root[i]>=0&&i%320<130){const y=Math.floor(i/320);m.set(y,[...(m.get(y)??[]),i%320]);}return m;};
 const a=rows(still),b=rows(left);let moved=0,kept=0;
 for(const [y,xs] of a){const ys=b.get(y);if(ys.join()===xs.join())kept++;else{assert.deepEqual(ys,xs.map(x=>x-1));moved++;}}
 assert.ok(moved>0&&kept>0,'crown rows move, trunk rows stay');
 for(let i=0;i<57600;i++)if(i%320>=130)assert.equal(left.root[i],still.root[i]);
 for(const s of [0,1,2.5,10])for(let t=0;t<20;t++)assert.ok(Math.abs(treeSwayAt(t,s))<=1);
});
