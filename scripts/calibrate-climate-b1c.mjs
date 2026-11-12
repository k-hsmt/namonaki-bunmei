/**
 * Issue #47 B1c: fit the classification thresholds once, on a CALIBRATION seed set that the audit never uses.
 *   node scripts/calibrate-climate-b1c.mjs   → prints THRESHOLDS to paste into scripts/lib/climate-prototype.mjs
 * Integer coordinate search minimising the squared distance to TARGET_SHARES, keeping the thresholds ordered.
 * The generator itself never reads this script or rerolls a world.
 */
import {BIOMES,TARGET_SHARES,THRESHOLDS,climateAxes,classifyClimate,climateHash} from './lib/climate-prototype.mjs';

export const CALIBRATION_SEEDS=Array.from({length:50000},(_,i)=>(climateHash(['b1c-calibration-seeds',i])%0xffffffff)+1);
const points=CALIBRATION_SEEDS.map(s=>{const a=climateAxes(s);return [a.effectiveTemperature,a.effectiveMoisture];});
const shares=t=>{const c=Object.fromEntries(BIOMES.map(b=>[b,0]));for(const [T,M] of points)c[classifyClimate(T,M,t)]++;
 return Object.fromEntries(BIOMES.map(b=>[b,c[b]/points.length]));};
const loss=t=>{const s=shares(t);return BIOMES.reduce((a,b)=>a+(s[b]-TARGET_SHARES[b])**2*(b==='desert'||b==='tundra'?4:1),0);};
const ordered=t=>t.tTundra<t.tBoreal&&t.tBoreal<t.tTropical&&t.mDesert<t.mSteppe&&t.mSteppe<t.mForest&&t.mForest<t.mRain;

let best={...THRESHOLDS},bestLoss=loss(best);
for(let round=0;round<40;round++){
 let improved=false;
 for(const key of Object.keys(best))for(const step of [8,4,2,1,-1,-2,-4,-8]){
  const cand={...best,[key]:best[key]+step};
  if(!ordered(cand))continue;
  const l=loss(cand);if(l<bestLoss-1e-12){best=cand;bestLoss=l;improved=true;}
 }
 if(!improved)break;
}
const s=shares(best);
console.log(JSON.stringify({calibrationSeeds:CALIBRATION_SEEDS.length,thresholds:best,loss:bestLoss,
 shares:Object.fromEntries(BIOMES.map(b=>[b,Math.round(s[b]*1000)/10])),unchanged:JSON.stringify(best)===JSON.stringify(THRESHOLDS)},null,1));
