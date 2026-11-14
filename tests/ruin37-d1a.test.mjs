/** Issue #37 D1a: independent visual fixture checks; no civilization history is fabricated or saved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {drawArchitecture} from '../dist/architecture/draw-v1.js';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {Raster} from '../scripts/lib/pixel-raster.mjs';
import {RULE_ID,WIDTH,HEIGHT,YEARS,RUIN_CONFIRMED_AT,MATERIALS,trialHash,trialEnvironment,
 trialSpec,trialAppearance,renderD1a} from '../scripts/lib/ruin37-d1a.mjs';
const cold={dominantBiome:'boreal_forest',effectiveMoisture:30,effectiveTemperature:-40};
const warm={dominantBiome:'tropical_rainforest',effectiveMoisture:55,effectiveTemperature:48};
const dry={dominantBiome:'desert',effectiveMoisture:-120,effectiveTemperature:55};
test('D1a: 4 distinct material specs are valid, source pixels are exact at abandonment',()=>{
 assert.equal(MATERIALS.length,4);
 const ids=new Set(MATERIALS.map(m=>m.id));assert.equal(ids.size,4);
 for(const m of MATERIALS){
  const spec=trialSpec(m.id);
  assert.equal(spec.wall,m.spec.wall);
  const a=new Raster(WIDTH,HEIGHT);
  drawArchitecture(a,spec,160,145,{width:72,height:27});
  const r=renderD1a({materialId:m.id,climate:warm,years:0});
  assert.deepEqual(r.building.data,a.data,'Prototype changed source architecture at age zero: '+m.id);
  assert.equal(r.metrics.mossPixels,0);assert.equal(r.metrics.vinePixels,0);
  assert.equal(r.appearance.state,'vacant');
  assert.ok(r.metrics.visiblePixels>0);
 }
});
test('D1a: recorded hypothetical event has an explicit source and does not infer auto collapse',()=>{
 for(const years of YEARS){
  const a=trialAppearance('stone',warm,years);
  assert.equal(a.ruleId,RULE_ID);
  assert.equal(a.confirmedEvents[0].kind,'vacated');
  assert.deepEqual(a.confirmedEvents.map(e=>e.year),years<RUIN_CONFIRMED_AT?[0]:[0,RUIN_CONFIRMED_AT]);
  assert.equal(a.state,years>=RUIN_CONFIRMED_AT?'ruined':'vacant');
 }
 assert.throws(()=>trialAppearance('stone',warm,100));
 assert.throws(()=>trialAppearance('unknown',warm,50));
});
test('D1a: moisture and thermal suitability differ; dry region does not grow vines',()=>{
 const w=trialEnvironment(warm),d=trialEnvironment(dry),c=trialEnvironment(cold);
 assert.ok(w.mossSuitability>d.mossSuitability);
 assert.ok(w.vineSuitability>c.vineSuitability);
 assert.equal(d.vineSuitability,0);assert.equal(d.mossSuitability,0);
 const humid=trialAppearance('stone',warm,500),arid=trialAppearance('stone',dry,500);
 assert.ok(humid.moss>arid.moss);assert.ok(humid.vines>arid.vines);
});
test('D1a: time and weathering are nondecreasing; visual mask does not add a real building',()=>{
 for(const m of MATERIALS){
  const views=YEARS.map(years=>renderD1a({materialId:m.id,climate:warm,years}));
  assert.ok(views.every((x,i)=>i===0||x.appearance.weathering>=views[i-1].appearance.weathering));
  assert.ok(views[2].metrics.visiblePixels<views[1].metrics.visiblePixels);
  assert.ok(views[3].metrics.visiblePixels<=views[2].metrics.visiblePixels);
  for(const v of views){
   assert.equal(v.raster.width,320);assert.equal(v.raster.height,180);
   assert.ok(v.metrics.visiblePixels>0);
   assert.ok(v.appearance.loss>=0&&v.appearance.loss<=1);
  }
 }
});
test('D1a: display noise and full output are deterministic and never use Math.random',()=>{
 const orig=Math.random;
 Math.random=()=>{throw Error('Do not consume RNG');};
 try{
  assert.equal(trialHash('b',24,500),trialHash('b',24,500));
  assert.notEqual(trialHash('b',24,500),trialHash('b',24,501));
  const a=renderD1a({materialId:'mixed',climate:warm,years:200});
  const b=renderD1a({materialId:'mixed',climate:warm,years:200});
  assert.deepEqual(a.raster.data,b.raster.data);
  assert.deepEqual(a.metrics,b.metrics);
 }finally{Math.random=orig;}
});
test('D1a: all canonical biomes are accepted as display-only climate inputs',()=>{
 const found=new Set();
 for(let seed=1;seed<=30000&&found.size<BIOME_KINDS.length;seed++){
  const c=generateClimateBaseline(seed);
  if(c.transition!==null||found.has(c.dominantBiome))continue;
  found.add(c.dominantBiome);
  for(const m of MATERIALS){
   const a=renderD1a({materialId:m.id,climate:c,years:200});
   assert.ok(a.raster.data.length===320*180*4);
  }
 }
 assert.equal(found.size,7);
});
