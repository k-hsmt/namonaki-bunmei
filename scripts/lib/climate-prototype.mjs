/**
 * Issue #47 B1c: initial world climate and dominant biome. PROTOTYPE ONLY — NOT YET SAVED OR USED BY THE GAME.
 * Design: docs/issue47-biome-design.md §3–§4. Reads nothing from src/ or dist/, and nothing reads it there.
 *
 * - Deterministic from the world seed through a dedicated namespace ('initial-climate-v1') of the same frozen
 *   length-prefixed FNV-1a hash the game uses (src/terrain/terrain-hash-v1.ts), copied here so B2 can switch to
 *   the game's terrainHash with identical values. It never touches the civilisation RNG or Math.random.
 * - The four axes are correlated; the dominant biome follows from effective temperature and moisture by fixed
 *   thresholds. There is no reroll, quota or rejection: every seed keeps the climate it is given.
 * - All values are game indices, not degrees or millimetres.
 */
export const CLIMATE_RULE_ID='initial-climate-v1';
export const BIOMES=Object.freeze(['desert','steppe','grassland','temperate_forest','tropical_rainforest','boreal_forest','tundra']);
/** Human target (Q2): desert and tundra about 10–12% each. The others are the B0 example table, open to B1 tuning. */
export const TARGET_SHARES=Object.freeze({desert:.11,steppe:.14,grassland:.15,temperate_forest:.19,tropical_rainforest:.15,boreal_forest:.15,tundra:.11});

/** Same algorithm as src/terrain/terrain-hash-v1.ts terrainHash (frozen D0 A.6). */
export function climateHash(parts){
 let h=2166136261;
 const byte=b=>{h=Math.imul(h^b,16777619);};
 for(const part of parts){
  const data=new TextEncoder().encode(String(part));
  for(let n=0;n<4;n++)byte((data.length>>>(n*8))&255);
  for(const b of data)byte(b);
 }
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
 h=Math.imul(h,0x846ca68b);h^=h>>>16;return h>>>0;
}
const unit=(seed,axis,n)=>(climateHash([CLIMATE_RULE_ID,seed,axis,n])+.5)/4294967296;
/** Approximately standard normal (Irwin–Hall, 4 uniforms, scaled to variance 1). */
const normal=(seed,axis)=>((unit(seed,axis,0)+unit(seed,axis,1)+unit(seed,axis,2)+unit(seed,axis,3))-2)*Math.sqrt(3);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));

/**
 * Classification thresholds on effective temperature (tTundra < tBoreal < tTropical) and effective moisture
 * (mDesert < mSteppe < mForest < mRain). Fitted once by scripts/calibrate-climate-b1c.mjs on the calibration seed
 * set and then fixed here; the audit uses other seed sets.
 */
export const THRESHOLDS=Object.freeze({tTundra:-62,tBoreal:-25,tTropical:17,mDesert:-65,mSteppe:-36,mForest:-13,mRain:2});

export function classifyClimate(effectiveTemperature,effectiveMoisture,t=THRESHOLDS){
 if(effectiveTemperature<t.tTundra)return 'tundra';
 if(effectiveMoisture<t.mDesert)return 'desert';
 if(effectiveMoisture<t.mSteppe)return 'steppe';
 if(effectiveTemperature<t.tBoreal)return 'boreal_forest';
 // Hot worlds go from savanna (grassland) straight to rainforest; temperate forest needs a cooler climate.
 if(effectiveTemperature>=t.tTropical)return effectiveMoisture>=t.mRain?'tropical_rainforest':'grassland';
 if(effectiveMoisture<t.mForest)return 'grassland';
 return 'temperate_forest';
}

/** The four base axes and the two effective values, before classification. */
export function climateAxes(seed){
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error('Invalid world seed');
 const zT=normal(seed,'temperature'),zM=normal(seed,'moisture'),zR=normal(seed,'range'),zC=normal(seed,'concentration');
 const temperatureIndex=clamp(48*zT,-100,100);
 // Warmer air carries a little more moisture; otherwise moisture is independent of temperature.
 const moistureSupplyIndex=clamp(50*zM+.12*temperatureIndex,-100,100);
 // Continentality: drier and colder worlds swing more between seasons.
 const annualTemperatureRangeIndex=clamp(45+14*zR-.18*moistureSupplyIndex-.12*temperatureIndex,0,100);
 // Rain concentrated in a wet season is commoner in warm, moderately moist climates.
 const rainfallConcentrationIndex=clamp(40+15*zC+.20*temperatureIndex-.10*moistureSupplyIndex,0,100);
 // Effective values for plants: harsh winters shorten the growing season; heat and a long dry season dry the land.
 const effectiveTemperature=clamp(temperatureIndex-.30*Math.max(0,annualTemperatureRangeIndex-50),-130,100);
 const effectiveMoisture=clamp(moistureSupplyIndex-.30*Math.max(0,temperatureIndex)-.30*Math.max(0,rainfallConcentrationIndex-50),-160,100);
 return {temperatureIndex,moistureSupplyIndex,annualTemperatureRangeIndex,rainfallConcentrationIndex,effectiveTemperature,effectiveMoisture};
}

/** Transition zone width in effective-index points (Human review: 8 put ~42% of worlds in a transition; 4 gives ~22%). */
export const TRANSITION_MARGIN=4;
/** Nearby biome across the closest threshold (within `margin` index points), for transition-zone planting. */
function transitionBiome(a,biome,margin){
 let best=null;
 for(let d=1;d<=margin;d++){
  for(const [dt,dm] of [[d,0],[-d,0],[0,d],[0,-d]]){
   const other=classifyClimate(a.effectiveTemperature+dt,a.effectiveMoisture+dm);
   if(other!==biome){best={biome:other,distance:d};break;}
  }
  if(best)break;
 }
 return best;
}

/** WorldClimateBaseline (design doc §4.1) plus the effective values and the nearest other biome. */
export function generateClimateBaseline(seed){
 const a=climateAxes(seed),dominantBiome=classifyClimate(a.effectiveTemperature,a.effectiveMoisture);
 return Object.freeze({schemaVersion:1,ruleId:CLIMATE_RULE_ID,...a,dominantBiome,transition:transitionBiome(a,dominantBiome,TRANSITION_MARGIN)});
}
