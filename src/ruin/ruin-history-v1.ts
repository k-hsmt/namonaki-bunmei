/**
 * Issue #37 D2: the weathering clocks of a building from the world's confirmed history (ruleId ruin-history-v1).
 *
 * Reads only records the world already keeps; adds nothing to a save:
 *  - housing blocks: the housing events (`after.use`, `after.condition`), oldest first by year and seq;
 *  - facilities (not fields or bridges): the observation's building changes (condition per year), oldest first.
 * A clock is computed for one observed year from the changes up to that year only, so a later repair or reuse never
 * changes how an earlier year looks (D0 §9). Appearance only; never read by history, economy or the civilisation RNG.
 */
import {ruinClimateOf,ruinLookOf,type RuinClimate,type RuinClocks,type RuinLook} from './ruin-weathering-v1.js';
import type {WorldClimateBaseline} from '../climate/initial-climate-v1.js';

export const RUIN_HISTORY_RULE_ID='ruin-history-v1' as const;
export interface HousingStateRecord {readonly year:number;readonly use:'occupied'|'underused'|'vacant';readonly condition:'sound'|'damaged'|'ruined'}
export interface FacilityStateRecord {readonly year:number;readonly condition:'intact'|'damaged'|'ruined'}
export interface RuinTimelines {
 readonly housing:ReadonlyMap<string,readonly HousingStateRecord[]>;
 readonly facilities:ReadonlyMap<string,readonly FacilityStateRecord[]>;
}
/** The parts of a civilisation state that hold the confirmed building states (structural, so tests can pass plain data). */
export interface RuinHistorySource {
 readonly housing?:{readonly events:readonly {readonly year:number;readonly seq:number;readonly blockId:string;readonly after:{readonly use:string;readonly condition:string}}[]}|null;
 readonly observation?:{readonly sites?:readonly ({readonly buildingChanges?:readonly {readonly year:number;readonly building:{readonly id:string;readonly kind:string;readonly condition:string}}[]}|null|undefined)[]}|null;
}
const USES=new Set(['occupied','underused','vacant']),HOUSING=new Set(['sound','damaged','ruined']),FACILITY=new Set(['intact','damaged','ruined']);

/** Housing and facility state timelines of a world. Unknown states are refused, not guessed. */
export function ruinTimelines(state:RuinHistorySource):RuinTimelines {
 const housing=new Map<string,HousingStateRecord[]>(),facilities=new Map<string,FacilityStateRecord[]>();
 const events=[...(state.housing?.events??[])].sort((a,b)=>a.year-b.year||a.seq-b.seq);
 for(const e of events){
  if(!USES.has(e.after.use)||!HOUSING.has(e.after.condition))throw Error('Unknown housing state');
  const list=housing.get(e.blockId)??[];list.push(Object.freeze({year:e.year,use:e.after.use as HousingStateRecord['use'],condition:e.after.condition as HousingStateRecord['condition']}));housing.set(e.blockId,list);
 }
 for(const site of state.observation?.sites??[])for(const c of site?.buildingChanges??[]){
  const b=c.building;if(b.kind==='field'||b.kind==='bridge')continue;
  if(!FACILITY.has(b.condition))throw Error('Unknown building condition');
  const list=facilities.get(b.id)??[];if(list.at(-1)?.condition===b.condition)continue;
  list.push(Object.freeze({year:c.year,condition:b.condition as FacilityStateRecord['condition']}));facilities.set(b.id,list);
 }
 for(const l of [...housing.values(),...facilities.values()])Object.freeze(l);
 return Object.freeze({housing,facilities});
}

/**
 * Clocks of one building in a confirmed year. `abandonedYears` counts from the year it became vacant (housing) or a
 * ruin (facility), and restarts when a ruin is repaired while still vacant (the restored building weathers anew);
 * `ruinedYears` counts from the year it became a ruin. In use: both null.
 */
export function ruinClocksAt(changes:readonly (HousingStateRecord|FacilityStateRecord)[]|undefined,year:number,kind:'housing'|'facility'):RuinClocks {
 if(!Number.isSafeInteger(year)||year<0)throw Error('Invalid ruin clock year');
 const open=(c:HousingStateRecord|FacilityStateRecord)=>kind==='housing'?(c as HousingStateRecord).use==='vacant':c.condition==='ruined';
 let prev:HousingStateRecord|FacilityStateRecord|null=null,since:number|null=null,ruin:number|null=null;
 for(const c of changes??[]){
  if(c.year>year)break;
  if(open(c)&&(!prev||!open(prev)))since=c.year;
  if(open(c)&&prev?.condition==='ruined'&&c.condition!=='ruined')since=c.year;
  if(!open(c))since=null;
  if(c.condition==='ruined'&&prev?.condition!=='ruined')ruin=c.year;
  if(c.condition!=='ruined')ruin=null;
  prev=c;
 }
 return since===null?{abandonedYears:null,ruinedYears:null}:{abandonedYears:year-since,ruinedYears:ruin===null?null:year-ruin};
}

/** Everything the live painter needs to weather a world's buildings: timelines, climate factors and cover colours. */
export function ruinContextOf(state:RuinHistorySource,climate:Pick<WorldClimateBaseline,'effectiveTemperature'|'effectiveMoisture'|'annualTemperatureRangeIndex'>,ground:string):{readonly timelines:RuinTimelines;readonly climate:RuinClimate;readonly look:RuinLook} {
 const c=ruinClimateOf(climate);return Object.freeze({timelines:ruinTimelines(state),climate:c,look:ruinLookOf(c,ground)});
}
