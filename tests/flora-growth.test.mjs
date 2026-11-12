/** Issue #47 B2c: plant development by year under the world's climate. Appearance only, derived, no save field. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {describeFloraPatch,FLORA_SITES} from '../dist/flora/local-flora-v1.js';
import {floraSiteAt,deviationAt,ceilingStage,allowedStage,stageOfAge,DECLINE_YEARS,TOLERANCE_JITTER} from '../dist/flora/flora-growth-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldFloraAt,prepareWorldSessionSave} from '../dist/story/world-session.js';

const find=f=>{for(let s=1;s<5000;s++)if(f(generateClimateBaseline(s)))return s;throw Error('no seed');};
const seeds={desert:find(c=>c.dominantBiome==='desert'&&!c.transition),tundra:find(c=>c.dominantBiome==='tundra'&&!c.transition),forest:find(c=>c.dominantBiome==='temperate_forest'&&!c.transition)};
const at=async(seed,years)=>architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,years,'automatic'));
const worlds={};for(const [k,s] of Object.entries(seeds))worlds[k]=await at(s,400);
const year=w=>w.review.environment.confirmedThrough;
const all=w=>FLORA_SITES.flatMap((_,i)=>worldFloraAt(w,year(w),i).map((v,j)=>v&&{...v,patch:describeFloraPatch(w.flora.sites[FLORA_SITES[i]][j])})).filter(Boolean);

test('B2c: the #34 deviation of every confirmed year is reproduced exactly from its checkpoints',()=>{
 for(const w of Object.values(worlds)){
  for(const y of [0,1,37,99,100,101,250,333,year(w)]){
   const env=observeGeneratedWorldSession(w,y,0).ground.environment;
   assert.deepEqual(deviationAt(w.review.environment,y),{humidity:env.humidity,temperature:env.temperature},'year '+y);
  }
  assert.throws(()=>deviationAt(w.review.environment,year(w)+1),/Unconfirmed/);
 }
});

test('B2c: tundra never grows trees and desert stays open away from water, even after 400 undisturbed years',()=>{
 for(const v of all(worlds.tundra))assert.ok(v.stage<=2&&v.ceiling<=2,'tundra holds shrubs at most');
 const desert=all(worlds.desert);
 for(const v of desert.filter(v=>v.patch.habitat==='ordinary'))assert.ok(v.ceiling<=2,'dry open land is never a stand of trees');
 assert.ok(desert.some(v=>v.patch.canopy==='riparian'&&v.ceiling>=3),'riverside trees can stand by freshwater');
 const forest=all(worlds.forest);
 assert.ok(forest.filter(v=>v.stage===4).length>=40,'a temperate forest world has mature stands');
});

test('B2c: plants never outgrow their time since the last clearing; cleared or occupied patches stay bare',()=>{
 for(const w of Object.values(worlds))for(const v of all(w)){
  assert.ok(v.stage<=stageOfAge(v.age));
  if(v.age<8)assert.equal(v.stage,0);
 }
});

test('B2c: a worsening climate is felt one stage per DECLINE_YEARS, never at once',()=>{
 // Ceilings fall from 4 to 1 at year T and stay there. Stage by year t = allowedStage(ceilings at t, t-25, …).
 const T=1000,ceilingAt=t=>t<T?4:1,stage=t=>allowedStage([0,1,2,3,4].map(k=>t-k*DECLINE_YEARS).map(ceilingAt));
 let previous=stage(T-1);assert.equal(previous,4);
 for(let t=T;t<T+200;t++){const s=stage(t);assert.ok(previous-s<=1,'drops at most one stage at a time');if(s<previous)assert.ok(t>=T+DECLINE_YEARS);previous=s;}
 assert.equal(stage(T+DECLINE_YEARS-1),4,'keeps its stage for DECLINE_YEARS');
 assert.equal(stage(T+DECLINE_YEARS),3);assert.equal(stage(T+2*DECLINE_YEARS),2);assert.equal(stage(T+3*DECLINE_YEARS),1);assert.equal(stage(T+500),1);
 assert.equal(allowedStage([2,4,4,4,4]),4,'a recent fall is not felt yet');assert.equal(allowedStage([4]),4);assert.equal(allowedStage([0]),0);
});

test('B2c: the ceiling follows climate, habitat and potential',()=>{
 const base=generateClimateBaseline(seeds.forest),flat={humidity:0,temperature:0};
 // [habitat, biome, canopy, shrub, herb, ground, age, potential] — temperate deciduous on ordinary land
 const deciduous=[0,3,0,8,9,3,100,85];
 assert.equal(ceilingStage(deciduous,base,flat,0),4);
 assert.equal(ceilingStage([0,3,0,8,9,3,100,30],base,flat,0),3,'lower potential, lower stands');
 const dry={...base,effectiveMoisture:-100};
 assert.equal(ceilingStage(deciduous,dry,flat,0),1,'no tree or shrub fits a very dry climate; grass remains');
 assert.equal(ceilingStage(deciduous,base,{humidity:-60,temperature:0},0)<=ceilingStage(deciduous,base,flat,0),true,'a dry spell never raises the ceiling');
 // A riverside patch keeps local water in a very dry climate (riverside tree, desert potential 65).
 assert.equal(ceilingStage([1,0,5,6,9,0,100,65],dry,flat,0),4,'oasis woods by freshwater');
 assert.equal(ceilingStage([0,0,4,6,9,0,100,10],dry,flat,0)<=2,true,'open desert stays open');
 assert.ok(TOLERANCE_JITTER>0&&TOLERANCE_JITTER<=10);
});

test('B2c: same world and year give the same flora, however the years were advanced; saves are unchanged by B2c',async()=>{
 const split=architectureProductionSession(await advanceArchitectureWorld((await advanceArchitectureWorld((await createNewArchitectureWorld(seeds.forest)).architecture,150,'automatic')),250,'automatic'));
 assert.equal(year(split),year(worlds.forest));
 for(const y of [0,120,year(split)])for(let i=0;i<3;i++)assert.deepEqual(worldFloraAt(split,y,i),worldFloraAt(worlds.forest,y,i),'year '+y+' site '+i);
 const packet=await prepareWorldSessionSave(worlds.forest);
 assert.deepEqual(Object.keys(packet).sort(),['climate','flora','format','schemaVersion','version','world'],'B2c adds no save field');
 assert.equal(packet.schemaVersion,2);
});

test('B2c: the growth module uses no random source and is not read by civilisation code',()=>{
 const text=readFileSync(new URL('../src/flora/flora-growth-v1.ts',import.meta.url),'utf8');
 assert.doesNotMatch(text,/Math\.random|Date\.now|performance\.now|new Date/);
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 for(const file of walk('src').filter(f=>/\/(story|irrigation|terrain|architecture|engine|environment|vegetation)\//.test(f)&&!f.endsWith('world-session.ts')))
  assert.doesNotMatch(readFileSync(file,'utf8'),/flora\/flora-growth-v1/,file+' must not read plant growth (appearance only)');
});
