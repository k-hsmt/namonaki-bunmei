/** Issue #47 B1c: initial climate prototype — determinism, ranges, classification, independence and seed-set shares. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BIOMES,TARGET_SHARES,THRESHOLDS,CLIMATE_RULE_ID,TRANSITION_MARGIN,climateHash,climateAxes,classifyClimate,generateClimateBaseline} from '../scripts/lib/climate-prototype.mjs';
import {terrainHash} from '../dist/terrain/terrain-hash-v1.js';

test('B1c: the climate hash is the game\'s frozen terrainHash, under its own namespace',()=>{
 for(const parts of [[CLIMATE_RULE_ID,1,'temperature',0],[CLIMATE_RULE_ID,4294967295,'moisture',3],['b1c-calibration-seeds',12345],['',0]])
  assert.equal(climateHash(parts),terrainHash(parts));
});

test('B1c: the same seed always gives the same climate, and all values stay in range',()=>{
 for(let seed=1;seed<=2000;seed+=7){
  const a=generateClimateBaseline(seed);
  assert.deepEqual(a,generateClimateBaseline(seed));
  assert.equal(a.schemaVersion,1);assert.equal(a.ruleId,'initial-climate-v1');
  assert.ok(a.temperatureIndex>=-100&&a.temperatureIndex<=100);
  assert.ok(a.moistureSupplyIndex>=-100&&a.moistureSupplyIndex<=100);
  assert.ok(a.annualTemperatureRangeIndex>=0&&a.annualTemperatureRangeIndex<=100);
  assert.ok(a.rainfallConcentrationIndex>=0&&a.rainfallConcentrationIndex<=100);
  for(const k of ['temperatureIndex','moistureSupplyIndex','annualTemperatureRangeIndex','rainfallConcentrationIndex','effectiveTemperature','effectiveMoisture'])
   assert.ok(Number.isInteger(a[k]),k);
  assert.ok(BIOMES.includes(a.dominantBiome));
  assert.equal(a.dominantBiome,classifyClimate(a.effectiveTemperature,a.effectiveMoisture));
  if(a.transition){assert.notEqual(a.transition.biome,a.dominantBiome);assert.ok(a.transition.distance>=1&&a.transition.distance<=TRANSITION_MARGIN);}
 }
 for(const bad of [0,-1,1.5,4294967296,NaN])assert.throws(()=>generateClimateBaseline(bad),/Invalid world seed/);
});

test('B1c: thresholds are ordered and the classification follows temperature and moisture',()=>{
 const t=THRESHOLDS;
 assert.ok(t.tTundra<t.tBoreal&&t.tBoreal<t.tTropical);
 assert.ok(t.mDesert<t.mSteppe&&t.mSteppe<t.mForest&&t.mForest<t.mRain);
 assert.equal(classifyClimate(t.tTundra-1,100),'tundra');
 assert.equal(classifyClimate(t.tTundra,t.mDesert-1),'desert');
 assert.equal(classifyClimate(50,t.mSteppe-1),'steppe');
 assert.equal(classifyClimate(t.tBoreal-1,50),'boreal_forest');
 assert.equal(classifyClimate(t.tTropical,t.mRain),'tropical_rainforest');
 assert.equal(classifyClimate(t.tTropical-1,t.mRain+20),'temperate_forest');
 assert.equal(classifyClimate(t.tTropical,t.mForest-1),'grassland');
 assert.equal(classifyClimate(t.tTropical,t.mRain-1),'grassland','a hot, moderately moist world is savanna, not temperate forest');
 assert.equal(classifyClimate(t.tTropical-1,t.mForest),'temperate_forest');
 // Warming a moist world never makes it colder-looking; drying it never makes it wetter-looking.
 const warm=['tundra','boreal_forest','temperate_forest','tropical_rainforest'];
 let last=-1;for(let T=-130;T<=100;T++){const i=warm.indexOf(classifyClimate(T,60));assert.ok(i>=last,'T '+T);last=i;}
 const wet=['desert','steppe','grassland','tropical_rainforest'];
 last=-1;for(let M=-160;M<=100;M++){const i=wet.indexOf(classifyClimate(40,M));assert.ok(i>=last,'M '+M);last=i;}
});

test('B1c: desert and tundra stay within the 8–14% warning band on 1000 sequential seeds; all 7 biomes occur',()=>{
 const counts=Object.fromEntries(BIOMES.map(b=>[b,0]));
 for(let seed=1;seed<=1000;seed++)counts[generateClimateBaseline(seed).dominantBiome]++;
 for(const b of ['desert','tundra'])assert.ok(counts[b]>=80&&counts[b]<=140,b+' '+counts[b]);
 for(const b of BIOMES)assert.ok(counts[b]>=50,b+' too rare: '+counts[b]);
 assert.equal(TRANSITION_MARGIN,4);
 let near=0;for(let seed=1;seed<=1000;seed++)if(generateClimateBaseline(seed).transition)near++;
 assert.ok(near>=150&&near<=300,'transition share '+near+'/1000');
 assert.equal(Object.values(TARGET_SHARES).reduce((a,b)=>a+b,0).toFixed(6),'1.000000');
});

test('B1c: the prototype is independent of the game code and of any random source',()=>{
 for(const f of ['../scripts/lib/climate-prototype.mjs','../scripts/audit-climate-distribution.mjs','../scripts/calibrate-climate-b1c.mjs']){
  const text=readFileSync(new URL(f,import.meta.url),'utf8');
  assert.doesNotMatch(text,/from\s+['"][^'"]*(?:\/src\/|\/dist\/)/,f);
  assert.doesNotMatch(text,/Math\.random\s*\(|Date\.now\s*\(|new Date\s*\(/,f);
 }
 // The generator reads only the seed: the same seed gives the same climate whatever else ran before.
 const before=generateClimateBaseline(88);for(let s=1;s<500;s++)climateAxes(s);
 assert.deepEqual(generateClimateBaseline(88),before);
});
