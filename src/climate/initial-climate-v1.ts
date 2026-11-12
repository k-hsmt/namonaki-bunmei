/**
 * Issue #47 B2a: a world's initial climate and dominant biome (ruleId initial-climate-v1).
 * The algorithm and thresholds are the reviewed B1c prototype (scripts/lib/climate-prototype.mjs,
 * docs/issue47-b1c-climate-distribution.md); tests require identical values for the same seed.
 *
 * - A pure function of the world seed: a dedicated namespace of the frozen terrainHash. It never reads or
 *   advances the civilisation RNG, terrain, settlement or any scene clock, and it is an input to none of them.
 * - No reroll, quota or rejection: every seed keeps the climate it is given.
 * - Values are game indices, not degrees or millimetres.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';

export const CLIMATE_RULE_ID='initial-climate-v1' as const;
export const BIOME_KINDS=['desert','steppe','grassland','temperate_forest','tropical_rainforest','boreal_forest','tundra'] as const;
export type BiomeKind=typeof BIOME_KINDS[number];
/** Fitted on the B1c calibration seed set and fixed (B1c review: shares accepted). */
export const CLIMATE_THRESHOLDS=Object.freeze({tTundra:-62,tBoreal:-25,tTropical:17,mDesert:-65,mSteppe:-36,mForest:-13,mRain:2});
/** Transition zone width in effective-index points (B1c review: about one world in five). */
export const CLIMATE_TRANSITION_MARGIN=4;

export interface ClimateTransition {readonly biome:BiomeKind;readonly distance:number}
export interface WorldClimateBaseline {
 readonly schemaVersion:1;readonly ruleId:typeof CLIMATE_RULE_ID;
 readonly temperatureIndex:number;readonly moistureSupplyIndex:number;
 readonly annualTemperatureRangeIndex:number;readonly rainfallConcentrationIndex:number;
 readonly effectiveTemperature:number;readonly effectiveMoisture:number;
 readonly dominantBiome:BiomeKind;readonly transition:ClimateTransition|null;
}

const unit=(seed:number,axis:string,n:number)=>(terrainHash([CLIMATE_RULE_ID,seed,axis,n])+.5)/4294967296;
/** Approximately standard normal (Irwin–Hall, 4 uniforms, scaled to variance 1). */
const normal=(seed:number,axis:string)=>((unit(seed,axis,0)+unit(seed,axis,1)+unit(seed,axis,2)+unit(seed,axis,3))-2)*Math.sqrt(3);
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,Math.round(v)));

export function classifyClimate(effectiveTemperature:number,effectiveMoisture:number):BiomeKind {
 const t=CLIMATE_THRESHOLDS;
 if(effectiveTemperature<t.tTundra)return 'tundra';
 if(effectiveMoisture<t.mDesert)return 'desert';
 if(effectiveMoisture<t.mSteppe)return 'steppe';
 if(effectiveTemperature<t.tBoreal)return 'boreal_forest';
 // Hot worlds go from savanna (grassland) straight to rainforest; temperate forest needs a cooler climate.
 if(effectiveTemperature>=t.tTropical)return effectiveMoisture>=t.mRain?'tropical_rainforest':'grassland';
 if(effectiveMoisture<t.mForest)return 'grassland';
 return 'temperate_forest';
}

function transitionOf(t:number,m:number,biome:BiomeKind):ClimateTransition|null {
 for(let d=1;d<=CLIMATE_TRANSITION_MARGIN;d++)
  for(const [dt,dm] of [[d,0],[-d,0],[0,d],[0,-d]] as const){const other=classifyClimate(t+dt,m+dm);if(other!==biome)return {biome:other,distance:d};}
 return null;
}

export function generateClimateBaseline(seed:number):WorldClimateBaseline {
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error('Invalid world seed');
 const zT=normal(seed,'temperature'),zM=normal(seed,'moisture'),zR=normal(seed,'range'),zC=normal(seed,'concentration');
 const temperatureIndex=clamp(48*zT,-100,100);
 const moistureSupplyIndex=clamp(50*zM+.12*temperatureIndex,-100,100);
 const annualTemperatureRangeIndex=clamp(45+14*zR-.18*moistureSupplyIndex-.12*temperatureIndex,0,100);
 const rainfallConcentrationIndex=clamp(40+15*zC+.20*temperatureIndex-.10*moistureSupplyIndex,0,100);
 const effectiveTemperature=clamp(temperatureIndex-.30*Math.max(0,annualTemperatureRangeIndex-50),-130,100);
 const effectiveMoisture=clamp(moistureSupplyIndex-.30*Math.max(0,temperatureIndex)-.30*Math.max(0,rainfallConcentrationIndex-50),-160,100);
 const dominantBiome=classifyClimate(effectiveTemperature,effectiveMoisture);
 return Object.freeze({schemaVersion:1,ruleId:CLIMATE_RULE_ID,temperatureIndex,moistureSupplyIndex,annualTemperatureRangeIndex,rainfallConcentrationIndex,
  effectiveTemperature,effectiveMoisture,dominantBiome,transition:(t=>t&&Object.freeze(t))(transitionOf(effectiveTemperature,effectiveMoisture,dominantBiome))});
}
