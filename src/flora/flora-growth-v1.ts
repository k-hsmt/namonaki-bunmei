/**
 * Issue #47 B2c: how far each patch's plant community has developed in a confirmed year (ruleId flora-growth-v1).
 * Appearance only (Human decision 2026-11-12): nothing here is read by civilisation, economy or #34.
 *
 * A pure function of data the world already records, so it needs no save field and cannot drift:
 * - growth: the #34 patch view of that year (age since the last clearing; it already accounts for buildings,
 *   fields, fire, abandonment, irrigation channels and terrain cuts, and freezes while a patch is occupied);
 * - ceiling: the most developed stage the patch's community can hold under the world's initial climate
 *   (initial-climate-v1), that year's #34 long-term deviation (converted with explicit factors), its local
 *   habitat and its establishment potential (local-flora-v1);
 * - decline: when the ceiling falls, a patch keeps its stage for DECLINE_YEARS, then loses one stage per
 *   DECLINE_YEARS. It never jumps to another species; recovery comes only through regrowth.
 * The #34 humidity/temperature of past years are reproduced with #34's own yearly rule from its checkpoints.
 */
import type {EnvironmentHistory} from '../environment/model-v1.js';
import type {VegetationPatchView} from '../vegetation/history-v1.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {WorldClimateBaseline} from '../climate/initial-climate-v1.js';
import {describeFloraPatch,FLORA_SITES,type FloraPatch,type Habitat,type LocalFlora,type PlantArchetype} from './local-flora-v1.js';

export const FLORA_GROWTH_RULE_ID='flora-growth-v1' as const;
/** Stage thresholds in years of growth: bare, grass, shrubs, young stand, mature stand (same as #32). */
export const STAGE_AGES=Object.freeze([0,8,28,75,150]);
export type FloraStage=0|1|2|3|4;
/** #34 deviations (humidity ±60, temperature ±40) are relative; half of them is added to the climate indices. */
export const DEVIATION_SCALE=Object.freeze({moisture:.5,temperature:.5});
export const HABITAT_SHIFT:Readonly<Record<Habitat,{moisture:number;temperature:number}>>=Object.freeze({
 ordinary:{moisture:0,temperature:0},riparian:{moisture:30,temperature:0},wetland:{moisture:45,temperature:0},coastal:{moisture:-5,temperature:0},rocky:{moisture:-20,temperature:-5}});
/** Water at a river or wetland is local: these habitats are never drier than this, however dry the climate. */
export const WATER_FLOOR:Readonly<Partial<Record<Habitat,number>>>=Object.freeze({riparian:-20,wetland:10});
/** Climate each form tolerates: [min, max] effective temperature and moisture (game indices). */
export const TOLERANCE:Readonly<Record<PlantArchetype,{t:readonly [number,number];m:readonly [number,number]}>>=Object.freeze({
 deciduous:{t:[-30,35],m:[-15,100]},evergreen:{t:[-5,100],m:[0,100]},conifer:{t:[-62,15],m:[-30,100]},tropical:{t:[17,100],m:[2,100]},
 savanna:{t:[0,100],m:[-80,20]},riparian:{t:[-40,100],m:[-60,100]},
 dryShrub:{t:[-40,100],m:[-160,40]},coldShrub:{t:[-130,10],m:[-80,100]},shrub:{t:[-30,100],m:[-40,100]},
 herb:{t:[-80,100],m:[-110,100]},understory:{t:[-10,100],m:[0,100]},wetland:{t:[-62,100],m:[-160,100]},moss:{t:[-130,30],m:[-60,100]}});
/** A patch's tolerance edges are shifted by 0..JITTER points (fixed per patch) so a landscape crosses gradually. */
export const TOLERANCE_JITTER=6;
export const DECLINE_YEARS=25;

export function stageOfAge(age:number):FloraStage {return (age>=150?4:age>=75?3:age>=28?2:age>=8?1:0) as FloraStage;}
const ok=(v:number,[lo,hi]:readonly [number,number],j:number)=>v>=lo-j&&v<=hi+j;

/** #34 global humidity/temperature deviation of a confirmed year, by #34's own yearly rule. */
export function deviationAt(e:EnvironmentHistory,year:number):{humidity:number;temperature:number} {
 if(!Number.isSafeInteger(year)||year<0||year>e.confirmedThrough)throw Error('Unconfirmed flora year');
 if(year===e.confirmedThrough)return {humidity:e.current.humidity,temperature:e.current.temperature};
 const cp=e.checkpoints[Math.floor(year/100)]!;let {humidity,temperature}=cp;
 const rule=e.ruleId==='environment-irrigated-v1'?e.climateRule:e.ruleId;
 for(let y=cp.year+1;y<=year;y++){const t=e.targets[Math.floor(y/100)]!,slow=rule==='environment-coupled-v2'&&y>=e.climateStart!;
  if(!slow||y%2===0){humidity+=Math.sign(t.humidity-humidity);temperature+=Math.sign(t.temperature-temperature);}}
 return {humidity,temperature};
}

/** The most developed stage a patch's community can hold under the given climate. */
export function ceilingStage(p:FloraPatch,climate:WorldClimateBaseline,deviation:{humidity:number;temperature:number},jitter:number):FloraStage {
 const d=describeFloraPatch(p),shift=HABITAT_SHIFT[d.habitat];
 const t=climate.effectiveTemperature+DEVIATION_SCALE.temperature*deviation.temperature+shift.temperature;
 const m=Math.max(climate.effectiveMoisture+DEVIATION_SCALE.moisture*deviation.humidity+shift.moisture,WATER_FLOOR[d.habitat]??-Infinity);
 const fits=(a:PlantArchetype|null)=>a!==null&&ok(t,TOLERANCE[a].t,jitter)&&ok(m,TOLERANCE[a].m,jitter);
 if(fits(d.canopy))return d.potential>=50?4:d.potential>=20?3:2;
 if(fits(d.shrub))return 2;
 if(fits(d.herb))return 1;
 return 0;
}

/**
 * Stage allowed after gradual decline, from the ceilings at this year and DECLINE_YEARS, 2×, 3×, 4× earlier
 * (oldest last; missing entries are years before the world). A fall is felt one stage per DECLINE_YEARS.
 */
export function allowedStage(ceilings:readonly FloraStage[]):FloraStage {
 let allowed:number=ceilings[0]!;
 for(let k=1;k<ceilings.length;k++)allowed=Math.max(allowed,ceilings[k]!-(k-1));
 return Math.max(0,allowed) as FloraStage;
}

export interface FloraPatchView {readonly index:number;readonly stage:FloraStage;readonly ceiling:FloraStage;readonly age:number;readonly disturbedYear:number|null}

/**
 * Plant development of one site in a confirmed year. `vegetation` is the #34 patch view of that year and site
 * (GeneratedSceneObservation.ground.vegetation). Patches #34 does not track (no stable land) keep their initial
 * age plus the elapsed years.
 */
export function floraSiteAt(input:{seed:number;climate:WorldClimateBaseline;flora:LocalFlora;environment:EnvironmentHistory;year:number;site:RecordSite;vegetation:readonly VegetationPatchView[]}):readonly (FloraPatchView|null)[] {
 const {seed,climate,flora,environment:e,year,site,vegetation}=input;
 if(!FLORA_SITES.includes(site as typeof FLORA_SITES[number]))throw Error('Invalid flora site');
 const lags=[0,1,2,3,4].map(k=>year-k*DECLINE_YEARS).filter(y=>y>=0).map(y=>deviationAt(e,y));
 const byIndex=new Map(vegetation.map(v=>[v.index,v]));
 return Object.freeze(flora.sites[site].map((p,index)=>{
  if(!p)return null;
  const jitter=terrainHash([FLORA_GROWTH_RULE_ID,seed,site,index])%(TOLERANCE_JITTER+1);
  const ceilings=lags.map(dev=>ceilingStage(p,climate,dev,jitter));
  const v=byIndex.get(index),age=v?v.age:p[6]+year,ceiling=ceilings[0]!;
  const stage=Math.min(stageOfAge(age),allowedStage(ceilings)) as FloraStage;
  return Object.freeze({index,stage,ceiling,age,disturbedYear:v?v.disturbedYear:null});
 }));
}
