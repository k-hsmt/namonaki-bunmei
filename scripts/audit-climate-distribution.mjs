/**
 * Issue #47 B1c: distribution audit of the initial climate and dominant biome. PROTOTYPE ONLY — NOT HISTORY.
 *   node scripts/audit-climate-distribution.mjs  →  artifacts/biome47-b1c/report.json (+ points.json for charts)
 * Seed sets never overlap the calibration set used to fit the thresholds (scripts/calibrate-climate-b1c.mjs).
 * Fails (exit code 1) if desert or tundra leaves the 8–14% warning band on any audit set of 1000 seeds,
 * if the population estimate leaves 10–12%, or if a climate sanity check breaks.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {BIOMES,TARGET_SHARES,THRESHOLDS,CLIMATE_RULE_ID,TRANSITION_MARGIN,generateClimateBaseline,climateHash} from './lib/climate-prototype.mjs';

const hashedSeeds=(namespace,n)=>Array.from({length:n},(_,i)=>(climateHash([namespace,i])%0xffffffff)+1);
const calibration=new Set(hashedSeeds('b1c-calibration-seeds',50000));
export const AUDIT_SETS=[
 {id:'sequential',label:'seed 1〜1000（連番）',seeds:Array.from({length:1000},(_,i)=>i+1)},
 {id:'random-a',label:'ランダム1000（集合A）',seeds:hashedSeeds('b1c-audit-random-a',1000)},
 {id:'random-b',label:'ランダム1000（集合B・再検証）',seeds:hashedSeeds('b1c-audit-random-b',1000)},
 {id:'population',label:'ランダム100,000（母比率の推定）',seeds:hashedSeeds('b1c-audit-population',100000)},
];
const EXTREME=['desert','tundra'],WARN={low:.08,high:.14},POPULATION={low:.10,high:.12};
const wilson=(k,n,z=1.96)=>{const p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h];};
const r3=v=>Math.round(v*1000)/1000;
const AXES=['temperatureIndex','moistureSupplyIndex','annualTemperatureRangeIndex','rainfallConcentrationIndex','effectiveTemperature','effectiveMoisture'];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const corr=(a,b)=>{const ma=mean(a),mb=mean(b);let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}return n/Math.sqrt(da*db);};

const failures=[],sets=[];
for(const set of AUDIT_SETS){
 const overlap=set.seeds.filter(s=>calibration.has(s)).length;
 if(overlap)failures.push(`${set.id}: ${overlap} seeds overlap the calibration set`);
 if(new Set(set.seeds).size!==set.seeds.length)failures.push(`${set.id}: duplicate seeds`);
 const worlds=set.seeds.map(generateClimateBaseline),n=worlds.length;
 const counts=Object.fromEntries(BIOMES.map(b=>[b,0]));for(const w of worlds)counts[w.dominantBiome]++;
 const shares=Object.fromEntries(BIOMES.map(b=>{const [lo,hi]=wilson(counts[b],n);
  return [b,{count:counts[b],share:r3(counts[b]/n),ci95:[r3(lo),r3(hi)],target:TARGET_SHARES[b],deviation:r3(counts[b]/n-TARGET_SHARES[b])}];}));
 for(const b of EXTREME){const s=counts[b]/n;
  const band=set.id==='population'?POPULATION:WARN;
  if(s<band.low||s>band.high)failures.push(`${set.id}: ${b} ${(s*100).toFixed(1)}% outside ${band.low*100}–${band.high*100}%`);}
 const byBiome=Object.fromEntries(BIOMES.map(b=>{const ws=worlds.filter(w=>w.dominantBiome===b);
  return [b,Object.fromEntries(AXES.map(k=>[k,ws.length?Math.round(mean(ws.map(w=>w[k]))):null]))];}));
 const columns=Object.fromEntries(AXES.map(k=>[k,worlds.map(w=>w[k])]));
 const correlations={};for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)correlations[AXES[i]+'~'+AXES[j]]=r3(corr(columns[AXES[i]],columns[AXES[j]]));
 const transition=worlds.filter(w=>w.transition).length;
 sets.push({id:set.id,label:set.label,seeds:n,firstSeeds:set.seeds.slice(0,5),calibrationOverlap:overlap,shares,
  axisMeans:Object.fromEntries(AXES.map(k=>[k,Math.round(mean(columns[k])*10)/10])),correlations,meansByBiome:byBiome,
  nearBoundaryShare:r3(transition/n)});
}
// Sanity of the climate–biome relation on the population set: the order of means must make physical sense.
const pop=sets.find(s=>s.id==='population').meansByBiome;
const order=(axis,list)=>list.every((b,i)=>i===0||pop[list[i-1]][axis]<pop[b][axis]);
const sanity={
 'tundra < boreal < temperate < tropical (effective temperature)':order('effectiveTemperature',['tundra','boreal_forest','temperate_forest','tropical_rainforest']),
 'desert < steppe < grassland < temperate forest (effective moisture)':order('effectiveMoisture',['desert','steppe','grassland','temperate_forest']),
 'grassland < tropical rainforest (effective moisture)':order('effectiveMoisture',['grassland','tropical_rainforest']),
};
for(const [k,v] of Object.entries(sanity))if(!v)failures.push('sanity: '+k);
// Determinism: the same seed always gives the same climate.
for(const s of [1,88,4294967295])if(JSON.stringify(generateClimateBaseline(s))!==JSON.stringify(generateClimateBaseline(s)))failures.push('nondeterministic seed '+s);

const out='artifacts/biome47-b1c';await mkdir(out,{recursive:true});
const report={status:'PROTOTYPE_NOT_HISTORY',issue:47,stage:'B1c',ruleId:CLIMATE_RULE_ID,sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 boundary:{readsGameHistory:false,usesGameRng:false,saveSchemaChange:false,rerollsOrQuotas:false},
 thresholds:THRESHOLDS,transitionMargin:TRANSITION_MARGIN,targets:TARGET_SHARES,warningBand:WARN,populationBand:POPULATION,calibration:{namespace:'b1c-calibration-seeds',seeds:calibration.size},
 sets,sanity,failures};
await writeFile(out+'/report.json',JSON.stringify(report,null,1)+'\n');
// Chart data: 3000 worlds of random set A (effective temperature × moisture) for the review page.
const sample=AUDIT_SETS[1].seeds.concat(AUDIT_SETS[2].seeds,hashedSeeds('b1c-audit-population',1000)).map(generateClimateBaseline)
 .map(w=>[w.effectiveTemperature,w.effectiveMoisture,BIOMES.indexOf(w.dominantBiome)]);
await writeFile(out+'/points.json',JSON.stringify({biomes:BIOMES,thresholds:THRESHOLDS,points:sample})+'\n');
console.log(JSON.stringify({type:'biome47-b1c',failures,sets:sets.map(s=>({id:s.id,n:s.seeds,...Object.fromEntries(BIOMES.map(b=>[b,(s.shares[b].share*100).toFixed(1)]))}))},null,1));
if(failures.length)process.exitCode=1;
