/** Issue #47 B2b: local habitat and initial plant community per patch, in sessions and save v10. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {createLocalFlora,describeFloraPatch,patchHabitat,FLORA_SITES,HABITAT_LIMITS,TRANSITION_PATCH_SHARE,PLANT_ARCHETYPES} from '../dist/flora/local-flora-v1.js';
import {validateClimateWorldSave} from '../dist/climate/climate-world-v1.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceWorldSessionAsync,prepareWorldSessionSave} from '../dist/story/world-session.js';
import {serializeWorldSave} from '../dist/story/world-save.js';

const findSeed=test=>{for(let s=1;s<5000;s++)if(test(generateClimateBaseline(s)))return s;throw Error('no seed');};
const seeds={desert:findSeed(c=>c.dominantBiome==='desert'&&!c.transition),tundra:findSeed(c=>c.dominantBiome==='tundra'&&!c.transition),
 forest:findSeed(c=>c.dominantBiome==='temperate_forest'&&!c.transition),transition:findSeed(c=>c.transition?.distance===1)};
const worlds={};for(const [k,s] of Object.entries(seeds))worlds[k]=await createNewArchitectureWorld(s);
const initial=w=>w.architecture.terrain.review.terrain;
function distances(surface,code){const d=new Int32Array(57600).fill(57600),q=[];for(let i=0;i<57600;i++)if(surface[i]===code){d[i]=0;q.push(i);}
 for(let h=0;h<q.length;h++){const i=q[h],x=i%320,y=Math.floor(i/320);for(const j of [x>0?i-1:-1,x<319?i+1:-1,y>0?i-320:-1,y<179?i+320:-1])if(j>=0&&d[j]>d[i]+1){d[j]=d[i]+1;q.push(j);}}return d;}
const cells=i=>{const y0=96+Math.floor(i/40)*8,x0=(i%40)*8,out=[];for(let y=y0;y<Math.min(180,y0+8);y++)for(let x=x0;x<x0+8;x++)out.push(y*320+x);return out;};

test('B2b: the session flora is the deterministic flora of the seed, climate and initial terrain; it does not change as years pass',async()=>{
 const w=worlds.forest,expected=createLocalFlora(seeds.forest,generateClimateBaseline(seeds.forest),initial(w));
 assert.deepEqual(w.flora,expected);assert.ok(Object.isFrozen(w.flora)&&Object.isFrozen(w.flora.sites['river-bank']));
 assert.deepEqual(createLocalFlora(seeds.forest,generateClimateBaseline(seeds.forest),initial(w)),expected,'regenerates identically');
 const later=await advanceWorldSessionAsync(w,120);assert.ok(later.state.year>0);assert.deepEqual(later.flora,w.flora);
});

test('B2b: patches without land have no flora; habitats follow the saved freshwater, sea and slopes',()=>{
 const seen={};
 for(const w of Object.values(worlds))for(const site of FLORA_SITES){
  const r=readOwnedRecordPhysics(initial(w).sites[site].physics),fresh=distances(r.surface,2),sea=distances(r.surface,3),patches=w.flora.sites[site];
  assert.equal(patches.length,440);
  for(const [i,p] of patches.entries()){
   const land=cells(i).filter(j=>r.surface[j]===1);
   assert.equal(p===null,land.length===0,site+' patch '+i);if(!p)continue;
   const d=describeFloraPatch(p);seen[d.habitat]=(seen[d.habitat]??0)+1;
   assert.equal(d.habitat,patchHabitat(r,fresh,sea,i));
   const minFresh=Math.min(...land.map(j=>fresh[j])),minSea=Math.min(...land.map(j=>sea[j]));
   if(d.habitat==='riparian'||d.habitat==='wetland')assert.ok(minFresh<=HABITAT_LIMITS.riparianFresh,'river habitat needs freshwater, not sea');
   if(d.habitat==='coastal')assert.ok(minSea<=HABITAT_LIMITS.coastalSea||land.some(j=>r.bearing[j]===1));
   if(d.habitat==='rocky')assert.ok(land.some(j=>r.grade[j]>0||r.bearing[j]===2));
   if(d.canopy==='riparian')assert.ok(['riparian','wetland'].includes(d.habitat),'riverside trees grow only by freshwater');
   if(d.herb==='wetland'&&d.habitat==='ordinary')assert.ok(['tropical_rainforest'].includes(d.biome),'reeds outside water edges only as tropical understory');
  }
 }
 for(const h of ['ordinary','riparian','wetland','coastal'])assert.ok(seen[h]>0,'habitat '+h+' occurs');
});

test('B2b: the climate sets the community — no trees in tundra, only savanna or riverside trees in desert, forest trees in forests',()=>{
 for(const p of FLORA_SITES.flatMap(s=>worlds.tundra.flora.sites[s]).filter(Boolean))assert.equal(describeFloraPatch(p).canopy,null);
 const desert=FLORA_SITES.flatMap(s=>worlds.desert.flora.sites[s]).filter(Boolean).map(describeFloraPatch);
 for(const d of desert){assert.ok([null,'savanna','riparian'].includes(d.canopy));if(d.habitat==='ordinary')assert.ok(d.potential<=10);}
 assert.ok(desert.some(d=>d.canopy==='riparian'&&d.potential>=35),'desert riverside trees can establish by freshwater');
 const forest=FLORA_SITES.flatMap(s=>worlds.forest.flora.sites[s]).filter(Boolean).map(describeFloraPatch);
 assert.ok(forest.filter(d=>['deciduous','evergreen','conifer'].includes(d.canopy)).length>forest.length/2);
 assert.ok(forest.filter(d=>d.habitat==='ordinary').every(d=>d.potential>=80));
});

test('B2b: in a transition world some patches take the neighbouring biome, about the planned share',()=>{
 const c=generateClimateBaseline(seeds.transition),all=FLORA_SITES.flatMap(s=>worlds.transition.flora.sites[s]).filter(Boolean).map(describeFloraPatch);
 const share=all.filter(d=>d.biome===c.transition.biome).length/all.length,target=TRANSITION_PATCH_SHARE[0]/100;
 assert.ok(Math.abs(share-target)<.08,share+' vs '+target);
 assert.ok(all.every(d=>d.biome===c.dominantBiome||d.biome===c.transition.biome));
 for(const k of ['desert','tundra','forest'])assert.ok(FLORA_SITES.flatMap(s=>worlds[k].flora.sites[s]).filter(Boolean).every(p=>describeFloraPatch(p).biome===generateClimateBaseline(seeds[k]).dominantBiome));
});

test('B2b: the saved flora must match its sources; a changed patch is rejected',async()=>{
 const packet=JSON.parse(serializeWorldSave(await prepareWorldSessionSave(worlds.forest)));
 assert.equal(packet.schemaVersion,2);assert.equal(packet.flora.ruleId,'local-flora-v1');
 assert.ok(await validateClimateWorldSave(JSON.parse(JSON.stringify(packet))));
 const i=packet.flora.sites['hill-side'].findIndex(Boolean);
 const changes=[p=>{p.flora.sites['hill-side'][i][2]=(p.flora.sites['hill-side'][i][2]+1)%PLANT_ARCHETYPES.length;},
  p=>{p.flora.sites['hill-side'][i]=null;},p=>{p.flora.ruleId='local-flora-v2';},p=>{delete p.flora;},p=>{p.flora.sites['hill-side'].pop();}];
 for(const change of changes){const p=JSON.parse(JSON.stringify(packet));change(p);await assert.rejects(validateClimateWorldSave(p),/Invalid v10 world/);}
});

test('B2b: the flora module uses no random source and is not read by civilisation code',()=>{
 const text=readFileSync(new URL('../src/flora/local-flora-v1.ts',import.meta.url),'utf8');
 assert.doesNotMatch(text,/Math\.random|Date\.now|performance\.now|new Date/);
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 for(const file of walk('src').filter(f=>/\/(story|irrigation|terrain|architecture|engine)\//.test(f)&&!f.endsWith('world-session.ts')))
  assert.doesNotMatch(readFileSync(file,'utf8'),/flora\/local-flora-v1/,file+' must not read the flora (B2b changes no history)');
});
