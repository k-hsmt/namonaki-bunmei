/** D4 result projection. Initial records retain their v1 validation and identity. */
import {readOwnedTerrainRecord,type ValidatedTerrainRecord} from './terrain-record.js';
import type {RecordSite,TerrainRecord} from './terrain-record-types.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
export interface TerrainHistory {
 readonly format:'terrain-history-review-v1';readonly schemaVersion:1;readonly status:'review-only';
 readonly ruleId:'terrain-revision-v1';readonly initial:ValidatedTerrainRecord;readonly baseHash:string;
 readonly confirmedThrough:number;readonly events:readonly never[];
}
export interface ResolvedTerrainAtYear {
 readonly format:'resolved-terrain-at-year';readonly status:'review-only';readonly year:number;
 readonly baseHash:string;readonly revisionId:string;readonly initial:ValidatedTerrainRecord;
 readonly source:TerrainRecord['source'];readonly geography:TerrainRecord['geography'];readonly sites:TerrainRecord['sites'];
}
export type TerrainPhysicalSource=ValidatedTerrainRecord|ResolvedTerrainAtYear;
const histories=new WeakSet<object>(),views=new WeakSet<object>();
const resolved=new WeakMap<object,Map<number,ResolvedTerrainAtYear>>();
const validYear=(year:number)=>Number.isSafeInteger(year)&&year>=0&&year<=10000;
function ownHistory(history:TerrainHistory):void {if(!histories.has(history))throw Error('Unowned terrain history');}
export function assertResolvedTerrain(view:ResolvedTerrainAtYear,year?:number,initial?:ValidatedTerrainRecord):void {
 if(!view||!views.has(view)||year!==undefined&&view.year!==year||initial!==undefined&&view.initial!==initial)throw Error('Terrain revision boundary or year mismatch');
}
export function readTerrainPhysicalSource(raw:TerrainPhysicalSource):TerrainPhysicalSource {
 if(raw?.format==='resolved-terrain-at-year'){assertResolvedTerrain(raw);return raw;}
 return readOwnedTerrainRecord(raw);
}
/** A mutable initial input is fully detached before the first asynchronous hash. */
export async function createTerrainHistory(raw:unknown,confirmedThrough:number):Promise<TerrainHistory> {
 if(!validYear(confirmedThrough))throw Error('Invalid terrain history horizon');
 const initial=readOwnedTerrainRecord(raw),baseHash=await terrainRevisionHash(initial);
 const history:TerrainHistory=Object.freeze({format:'terrain-history-review-v1',schemaVersion:1,status:'review-only',ruleId:'terrain-revision-v1',initial,baseHash,confirmedThrough,events:Object.freeze([])});
 histories.add(history);return history;
}
/** Horizon changes are explicit; observation cannot advance history. */
export function terrainHistoryThrough(history:TerrainHistory,confirmedThrough:number):TerrainHistory {
 ownHistory(history);if(!validYear(confirmedThrough)||confirmedThrough<history.confirmedThrough)throw Error('Invalid terrain history horizon');
 if(confirmedThrough===history.confirmedThrough)return history;
 const next=Object.freeze({...history,confirmedThrough});histories.add(next);return next;
}
export function resolveTerrainAtYear(history:TerrainHistory,year:number):ResolvedTerrainAtYear {
 ownHistory(history);if(!validYear(year)||year>history.confirmedThrough)throw Error('Unconfirmed terrain year');
 let years=resolved.get(history);if(!years){years=new Map();resolved.set(history,years);}let view=years.get(year);
 if(!view){const {initial,baseHash}=history;view=Object.freeze({format:'resolved-terrain-at-year',status:'review-only',year,baseHash,revisionId:baseHash,initial,source:initial.source,geography:initial.geography,sites:initial.sites});views.add(view);years.set(year,view);}
 return view;
}
/** Context adapters use this gate before touching revision-dependent caches. */
export function assertTerrainPhysicalYear(terrain:TerrainPhysicalSource,year:number):void {
 if(terrain.format==='resolved-terrain-at-year')assertResolvedTerrain(terrain,year);
}
export function terrainInitialRecord(terrain:TerrainPhysicalSource):ValidatedTerrainRecord {
 return terrain.format==='resolved-terrain-at-year'?(assertResolvedTerrain(terrain),terrain.initial):terrain;
}
export function terrainSitePhysics(terrain:TerrainPhysicalSource,site:RecordSite){return readTerrainPhysicalSource(terrain).sites[site].physics;}
