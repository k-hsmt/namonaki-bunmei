/**
 * Issue #36 D1a PROTOTYPE: how a season looks (ruleId season-presentation-v1, parameters not final).
 *
 * Appearance only. The live game passes no season, so nothing here runs there yet (D0 §10: no default-world
 * integration before D2). The D1a gallery forces each of the 4 phases on real scenes for review.
 * Phase = confirmed year mod 4 (0 sprouting, 1 lush, 2 declining/autumn, 3 dormant), a representative-landscape
 * abstraction (D0 §2), never a calendar. Strengths come from the world's climate (initial-climate-v1): a large
 * annual range in a cool world makes a cold dormant phase; strongly seasonal rain in a warm world makes a dry one.
 * Pure functions; no random source; never read by history, economy or the civilisation RNG.
 */
import type {WorldClimateBaseline} from '../climate/initial-climate-v1.js';
import type {PlantArchetype} from '../flora/local-flora-v1.js';

export const SEASON_RULE_ID='season-presentation-v1' as const;
export type SeasonPhase=0|1|2|3;
export const SEASON_PHASES=Object.freeze([0,1,2,3] as const);
export interface SeasonalView {
 readonly ruleId:typeof SEASON_RULE_ID;readonly phase:SeasonPhase;
 /** 0..1: how cold the dormant phase is (leaf fall, straw grass, dull evergreens). */
 readonly cold:number;
 /** 0..1: how dry the dry phase is (warm worlds with concentrated rain). */
 readonly dry:number;
 /** 0..1: snow cover of this phase (D1b): deep in the dormant phase of cold worlds, a little early and late snow. */
 readonly snow:number;
}
/** Snow cover by phase from the cold strength (D1b parameters, to be calibrated by review). */
export const SNOW_PARAMETERS=Object.freeze({winterStart:.3,winterSpan:.5,lateStart:.8,lateSpan:.2,lateShare:.45,earlyStart:.9,earlySpan:.1,earlyShare:.2});
export function snowCoverOf(phase:SeasonPhase,cold:number):number {
 const p=SNOW_PARAMETERS;
 const v=phase===3?clamp01((cold-p.winterStart)/p.winterSpan):phase===0?clamp01((cold-p.lateStart)/p.lateSpan)*p.lateShare:phase===2?clamp01((cold-p.earlyStart)/p.earlySpan)*p.earlyShare:0;
 return Math.round(v*100)/100;
}
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
/** D1a parameters (to be calibrated by review). */
export const SEASON_PARAMETERS=Object.freeze({winterRange:.8,coldStart:-10,coldSpan:40,dryConcentration:35,drySpan:35,dryMoistureStart:40,dryMoistureSpan:80,hotForDry:0});

export function seasonPhaseOfYear(year:number):SeasonPhase {if(!Number.isSafeInteger(year)||year<0)throw Error('Invalid season year');return (year%4) as SeasonPhase;}
export function seasonalViewOf(phase:SeasonPhase,climate:WorldClimateBaseline):SeasonalView {
 const p=SEASON_PARAMETERS,winter=climate.effectiveTemperature-p.winterRange*climate.annualTemperatureRangeIndex;
 const cold=clamp01((p.coldStart-winter)/p.coldSpan);
 // A dry season matters where it is not cold: warm worlds whose rain falls in a few months.
 const dry=clamp01((climate.rainfallConcentrationIndex-p.dryConcentration)/p.drySpan)*clamp01((p.dryMoistureStart-climate.effectiveMoisture)/p.dryMoistureSpan+.3)*(1-cold);
 const c=Math.round(cold*100)/100;
 return Object.freeze({ruleId:SEASON_RULE_ID,phase,cold:c,dry:Math.round(dry*100)/100,snow:snowCoverOf(phase,c)});
}

/** What a plant form shows in a season. */
export interface PlantSeasonLook {
 /** Share of leaf pixels kept (1 all, 0 none: bare branches are drawn). */
 readonly leaves:number;
 /** Leaf recolouring: target colour and strength 0..1. `autumn` picks warm colours per plant. */
 readonly tint:{readonly color:'fresh'|'deep'|'autumn'|'straw'|'dull'|'rust';readonly strength:number}|null;
 /** 0..1: snow on the plant's upward-facing edges (D1b). */
 readonly snow?:number;
}
const DECIDUOUS:readonly PlantArchetype[]=['deciduous','riparian'];
const STILL:PlantSeasonLook=Object.freeze({leaves:1,tint:null});
/** The look of one plant form in a season (D1a table; see docs/issue36-d1a-season-gallery.md). */
export function plantSeasonLook(id:PlantArchetype,v:SeasonalView):PlantSeasonLook {
 const base=plantLeafLook(id,v);return v.snow>0?Object.freeze({...base,snow:v.snow}):base;
}
function plantLeafLook(id:PlantArchetype,v:SeasonalView):PlantSeasonLook {
 const {phase,cold,dry}=v,look=(leaves:number,color:NonNullable<PlantSeasonLook['tint']>['color']|null,strength:number):PlantSeasonLook=>
  Object.freeze({leaves:Math.round(clamp01(leaves)*100)/100,tint:color&&strength>.02?Object.freeze({color,strength:Math.round(clamp01(strength)*100)/100}):null});
 const stress=Math.max(cold,dry);
 if(phase===1)return look(1,'deep',.12);
 if(DECIDUOUS.includes(id)){
  if(phase===0)return look(1-.35*cold-.25*dry,'fresh',.55*cold+.3*dry+.1);
  if(phase===2)return look(1-.15*stress,'autumn',.85*cold+.45*dry);
  return look(1-1.25*cold-.6*dry,'autumn',.5*dry);
 }
 switch(id){
  case 'evergreen':case 'tropical':return phase===0?look(1,'fresh',.15+.2*dry):phase===2?look(1,'straw',.25*dry):look(1-.15*dry,'dull',.25*cold+.3*dry);
  case 'conifer':return phase===0?look(1,'fresh',.12):phase===3?look(1,'dull',.35*cold):STILL;
  case 'savanna':return phase===0?look(1,'fresh',.2+.3*dry):phase===2?look(1-.2*dry,'straw',.4*dry+.3*cold):look(1-.55*dry-.6*cold,'straw',.5*dry+.4*cold);
  case 'shrub':case 'dryShrub':return phase===0?look(1-.2*cold,'fresh',.35*stress+.1):phase===2?look(1-.1*stress,'autumn',.6*cold+.4*dry):look(1-.8*cold-.5*dry,'rust',.4*stress);
  case 'coldShrub':return phase===0?look(1,'fresh',.25):phase===2?look(1,'rust',.6*Math.max(cold,.5)):look(.85,'dull',.5);
  case 'herb':case 'wetland':return phase===0?look(1,'fresh',.4*stress+.15):phase===2?look(1,'straw',.55*stress+.1):look(1,'straw',.85*stress);
  case 'understory':return phase===0?look(1,'fresh',.3*cold+.1):phase===2?look(1,'straw',.45*cold):look(1-.6*cold,'rust',.6*cold);
  case 'moss':return phase===3?look(1,'dull',.4*stress):phase===2?look(1,'rust',.25*stress):STILL;
  default:return STILL;
 }
}

/** Ground in a season: grassy biomes green up and turn to straw; forests get a little litter colour. 0..1 strengths. */
export function groundSeasonLook(biome:string,v:SeasonalView):{readonly green:number;readonly straw:number;readonly litter:number} {
 const grassy=['steppe','grassland','tundra','temperate_forest','boreal_forest'].includes(biome),stress=Math.max(v.cold,v.dry);
 if(v.phase===0)return {green:grassy?.08+.06*stress:.03,straw:0,litter:0};
 if(v.phase===1)return {green:grassy?.1:.04,straw:0,litter:0};
 if(v.phase===2)return {green:0,straw:grassy?.08*stress:.03*stress,litter:['temperate_forest','boreal_forest'].includes(biome)?.12*v.cold:0};
 return {green:0,straw:grassy?.14*stress:.06*stress,litter:biome==='temperate_forest'?.08*v.cold:0};
}
