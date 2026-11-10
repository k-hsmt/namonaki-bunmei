/** D4 result projection. Initial records retain their v1 validation and identity. */
import {readOwnedTerrainRecord,type ValidatedTerrainRecord} from './terrain-record.js';
import type {RecordSite,TerrainRecord,RecordSiteTerrain} from './terrain-record-types.js';
import type {TerrainCutChange} from './terrain-change-types-v1.js';
import {decodeRecordPhysics,encodeRecordPhysics} from './terrain-record-raster-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
export interface TerrainHistory {
 readonly format:'terrain-history-review-v1';readonly schemaVersion:1;readonly status:'review-only';
 readonly ruleId:'terrain-revision-v1';readonly initial:ValidatedTerrainRecord;readonly baseHash:string;
 readonly confirmedThrough:number;readonly events:readonly TerrainCutChange[];
}
export interface ResolvedTerrainAtYear {
 readonly format:'resolved-terrain-at-year';readonly status:'review-only';readonly year:number;
 readonly baseHash:string;readonly revisionId:string;readonly initial:ValidatedTerrainRecord;
 readonly changes:readonly TerrainCutChange[];
 readonly source:TerrainRecord['source'];readonly geography:TerrainRecord['geography'];readonly sites:TerrainRecord['sites'];
}
export type TerrainPhysicalSource=ValidatedTerrainRecord|ResolvedTerrainAtYear;
const histories=new WeakSet<object>(),views=new WeakSet<object>();
const resolved=new WeakMap<object,Map<number,ResolvedTerrainAtYear>>();
const snapshots=new WeakMap<object,readonly {event:TerrainCutChange;sites:TerrainRecord['sites']}[]>();
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
 const next=Object.freeze({...history,confirmedThrough});histories.add(next);snapshots.set(next,snapshots.get(history)??[]);return next;
}
export function resolveTerrainAtYear(history:TerrainHistory,year:number):ResolvedTerrainAtYear {
 ownHistory(history);if(!validYear(year)||year>history.confirmedThrough)throw Error('Unconfirmed terrain year');
 let years=resolved.get(history);if(!years){years=new Map();resolved.set(history,years);}let view=years.get(year);
 if(!view){const {initial,baseHash}=history,active=(snapshots.get(history)??[]).filter(s=>s.event.effectiveYear<=year),last=active.at(-1);view=Object.freeze({format:'resolved-terrain-at-year',status:'review-only',year,baseHash,revisionId:last?.event.revisionId??baseHash,initial,source:initial.source,geography:initial.geography,sites:last?.sites??initial.sites,changes:Object.freeze(active.map(s=>s.event))});views.add(view);years.set(year,view);}
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

/** Trusted cut writer only. External saves replay through the cut validator before reaching this boundary. */
export function appendTerrainCutInternal(history:TerrainHistory,event:TerrainCutChange):TerrainHistory {
 ownHistory(history);if(event.approvedYear!==history.confirmedThrough||event.effectiveYear!==event.approvedYear+1||event.effectiveYear>10000||history.events.length>=4||history.events.some(e=>e.approvedYear>=event.approvedYear)||event.parentRevision!==resolveTerrainAtYear(history,event.approvedYear).revisionId)throw Error('Invalid terrain cut commit boundary');
 const previous=(snapshots.get(history)??[]).at(-1)?.sites??history.initial.sites,r=decodeRecordPhysics(previous['hill-side'].physics);let last=-1;
 if(!event.cells.length||event.cells.length>640)throw Error('Invalid terrain cell budget');
 for(const cell of event.cells){const [i,...values]=cell;if(!Number.isSafeInteger(i)||i<=last||i<96*320||i>=57600)throw Error('Invalid terrain cell order');last=i;
  const keys=['surface','grade','bearing','elevation'] as const;for(let n=0;n<4;n++){const key=keys[n]!;if(r[key][i]!==values[n])throw Error('Terrain cell before value differs');const after=values[n+4]!;if(!Number.isSafeInteger(after)||after<0||after>255)throw Error('Invalid terrain cell value');r[key][i]=after;}
 }
 const physics=encodeRecordPhysics(r);physics.rows.forEach(row=>{row.forEach(Object.freeze);Object.freeze(row);});Object.freeze(physics.rows);Object.freeze(physics);
 const changed=new Set(event.cells.filter(c=>event.ruleId==='terrain-cut-review-v2'||c[4]!==c[8]).map(c=>c[0])),site=previous['hill-side'];
 const decals=Object.freeze(site.render.decals.filter(([x,y,w])=>!Array.from({length:w},(_,n)=>y*320+x+n).some(i=>changed.has(i))));
 const updated:RecordSiteTerrain=Object.freeze({...site,physics,render:Object.freeze({...site.render,decals})}),sites=Object.freeze({...previous,'hill-side':updated});
 const next:TerrainHistory=Object.freeze({...history,events:Object.freeze([...history.events,event])});histories.add(next);snapshots.set(next,Object.freeze([...(snapshots.get(history)??[]),{event,sites}]));return next;
}
