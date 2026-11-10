/**
 * Issue #35 D2-b1: the v9 architecture layer over an owned v8 terrain-production world
 * (architecture-production-world-v1). New worlds only (Human decision 3), introduced at year 0.
 *
 * - The v8 world is advanced exactly as before; architecture never feeds back into it (one-way), so
 *   social, economic, terrain and placement history stays byte-identical to plain v8 for the same seed.
 * - Every confirmed construction gets exactly one recorded birth style: each facility placement
 *   (field excluded; civic halls are facilities with a civic attribute) and each housing `built` /
 *   `expanded` event. Births are derived from the recorded v8 history and the terrain of the
 *   construction year, then stored; the reader recomputes all of them and rejects any difference.
 * - The air-space envelope and its fallback chain are deferred to D2-b2 (Human decision A on D2-b).
 * - Not connected to the common world-save dispatch, browser keys or UI (D2-d, together with D3).
 */
import type {TerrainProductionWorld} from '../terrain/terrain-production-types-v1.js';
import type {TerrainProductionSave} from '../terrain/terrain-production-wire-v1.js';
import {knownTerrainProductionWorldInternal} from '../terrain/terrain-production-owned-internal.js';
import {advanceTerrainProductionWorld,chooseTerrainProductionWorld} from '../terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../terrain/terrain-production-storage-v1.js';
import {validateTerrainProductionSave,restoreTerrainProductionSave} from '../terrain/terrain-production-history-v1.js';
import {terrainProductionMaxBytes} from '../terrain/terrain-production-contract-v1.js';
import {resolveTerrainAtYear,terrainSitePhysics} from '../terrain/terrain-revision-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {measureSiteAdaptation,measurePlotAdaptation} from './adaptation-v1.js';
import {architecturePolicy,createWorldGrammar,createRegionalTradition,deriveBirthFeatures,
 type ArchitectureSite,type WorldArchitecturalGrammar,type RegionalArchitecturalTradition,type BirthFeatures,type BuildingRef,type BirthSource} from './grammar-v1.js';
import type {Use} from './vocab-v1.js';

export const ARCHITECTURE_WORLD_FORMAT='architecture-production-world-v1';
const sites:readonly ArchitectureSite[]=['river-bank','hill-side','coast-inlet'];
export interface ArchitectureLedger {
 readonly format:'architecture-ledger-v1';readonly schemaVersion:1;readonly policy:typeof architecturePolicy;
 /** D2-b1 records no envelope. D2-b2 adds it with a new schema before any public release. */
 readonly envelope:'deferred-to-d2-b2';
 readonly grammar:WorldArchitecturalGrammar;readonly traditions:readonly RegionalArchitecturalTradition[];
 readonly births:readonly BirthFeatures[];
}
export interface ArchitectureProductionWorld {
 readonly format:typeof ARCHITECTURE_WORLD_FORMAT;readonly status:'production';
 readonly terrain:TerrainProductionWorld;readonly architecture:ArchitectureLedger;
}
export interface ArchitectureProductionSave {
 readonly format:'namonaki-world-save';readonly version:9;readonly schemaVersion:1;
 readonly world:TerrainProductionSave;readonly architecture:ArchitectureLedger;
}

const fail=(m:string):never=>{throw Error('architecture production: '+m);};
const deepFreeze=<T>(o:T):T=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(deepFreeze);Object.freeze(o);}return o;};
const worlds=new WeakSet<object>(),packets=new WeakMap<object,ArchitectureProductionWorld>();
function own(world:ArchitectureProductionWorld):ArchitectureProductionWorld {knownTerrainProductionWorldInternal(world.terrain);deepFreeze(world.architecture);Object.freeze(world);worlds.add(world);return world;}
export function knownArchitectureWorld(world:ArchitectureProductionWorld):void {if(!worlds.has(world))fail('use an owned or validated architecture world');}

// ---- what was built, from the recorded v8 history ----
const facilityUse:Readonly<Record<string,Use>>={house:'house',hall:'hall',granary:'granary',workshop:'workshop',market:'market',civic:'hall'};
const housingUse:Readonly<Record<string,Use>>={low:'house',terraced:'rowhouse',courtyard:'courtyard'};
type Plot={readonly x:number;readonly y:number;readonly width:number;readonly depth:number};
export interface Construction {readonly ref:BuildingRef;readonly source:BirthSource;readonly use:Use;readonly plot:Plot}
/**
 * Lists every construction in the recorded history, in the fixed processing order of design §5.3:
 * year → site → facility before housing → id → seq. Inconsistent records fail closed.
 */
export function listConstructions(world:TerrainProductionWorld):Construction[] {
 const r=world.review,state=r.state,out:Construction[]=[];
 const observed=state.observation?.sites??fail('missing settlement ledger');
 for(const p of r.placements){
  if(p.kind==='field')continue;
  const use=facilityUse[p.kind]??fail('unknown facility kind '+p.kind);
  const siteIndex=sites.indexOf(p.site as ArchitectureSite);if(siteIndex<0)fail('unknown site '+p.site);
  const first=observed[siteIndex]!.buildingChanges.find(c=>c.building.id===p.objectId);
  if(first&&first.year!==p.builtYear)fail('facility '+p.objectId+' first recorded in '+first.year+', placed in '+p.builtYear);
  let civic:{style:'great-hall'|'courtyard-hall';constructionRecordId:string}|undefined;
  if(p.kind==='civic'){
   const f=first?.building.civic??fail('civic placement without a civic hall '+p.objectId);
   if(f.constructionRecordId!==p.sourceRecordId)fail('civic construction source mismatch '+p.objectId);
   civic={style:f.architectureStyle,constructionRecordId:f.constructionRecordId};
  }
  out.push({ref:{kind:'facility',siteId:p.site as ArchitectureSite,id:p.objectId,...(civic?{civic}:{})},source:{kind:'built',year:p.builtYear,recordId:p.sourceRecordId},use,plot:p.plot});
 }
 const counts=new Map<string,number>();
 for(const e of state.housing?.events??[]){
  if(e.kind!=='built'&&e.kind!=='expanded'){continue;}
  const before=counts.get(e.blockId)??0,after=e.after.housingCount;
  if(e.kind==='built'&&before!==0||e.kind==='expanded'&&(before===0||after<=before))fail('housing parts out of order for '+e.blockId);
  counts.set(e.blockId,after);
  const use=housingUse[e.after.styleId]??fail('unknown housing style '+e.after.styleId);
  out.push({ref:{kind:'housing',siteId:e.after.siteId,blockId:e.blockId,parts:{from:before,to:after}},source:{kind:e.kind,year:e.year,seq:e.seq,...(e.causeRecordId?{recordId:e.causeRecordId}:{})},use,plot:e.after.footprint});
 }
 const key=(c:Construction)=>[c.source.year,sites.indexOf(c.ref.siteId),c.ref.kind==='facility'?0:1,c.ref.kind==='facility'?c.ref.id:c.ref.blockId,c.source.seq??0] as const;
 return out.sort((a,b)=>{const x=key(a),y=key(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]!<y[i]!?-1:1;}return 0;});
}

function grammarAndTraditions(world:TerrainProductionWorld){
 const initial=world.terrainHistory.initial,grammar=createWorldGrammar(world.review.state.seed);
 const vegetation=world.vegetation??fail('missing initial vegetation');
 const traditions=sites.map(site=>createRegionalTradition(grammar,site,measureSiteAdaptation(readOwnedRecordPhysics(initial.sites[site].physics),vegetation.initial[site])));
 return {grammar,traditions};
}
function birthOf(world:TerrainProductionWorld,grammar:WorldArchitecturalGrammar,traditions:readonly RegionalArchitecturalTradition[],c:Construction):BirthFeatures {
 const tradition=traditions[sites.indexOf(c.ref.siteId)]!;
 // Design §5.2 input 2: the confirmed terrain of the construction year, never the latest terrain.
 const raster=readOwnedRecordPhysics(terrainSitePhysics(resolveTerrainAtYear(world.terrainHistory,c.source.year),c.ref.siteId));
 const r=deriveBirthFeatures({grammar,tradition,ref:c.ref,source:c.source,use:c.use,plot:measurePlotAdaptation(raster,c.plot)});
 if(r.status!=='ok')return fail('birth HOLD for '+JSON.stringify(c.ref)+': '+r.detail);
 return r;
}
/** The complete ledger the recorded v8 history implies. Pure in the v8 world; used by the writer and the reader. */
export function expectedArchitectureLedger(world:TerrainProductionWorld):ArchitectureLedger {
 knownTerrainProductionWorldInternal(world);
 const {grammar,traditions}=grammarAndTraditions(world);
 return {format:'architecture-ledger-v1',schemaVersion:1,policy:architecturePolicy,envelope:'deferred-to-d2-b2',grammar,traditions,
  births:listConstructions(world).map(c=>birthOf(world,grammar,traditions,c))};
}
const sameLedger=(a:ArchitectureLedger,b:ArchitectureLedger)=>JSON.stringify(a)===JSON.stringify(b);

// ---- lifecycle ----
/** New worlds only: the owned v8 world must still be at year 0 with nothing pending. */
export function introduceArchitectureProduction(terrain:TerrainProductionWorld):ArchitectureProductionWorld {
 knownTerrainProductionWorldInternal(terrain);
 if(terrain.review.state.year!==0||terrain.review.state.pending||terrain.terrainDevelopment.introducedYear!==0)fail('architecture starts only with a new world at year 0');
 return own({format:ARCHITECTURE_WORLD_FORMAT,status:'production',terrain,architecture:expectedArchitectureLedger(terrain)});
}
/**
 * Design §5.3 update boundary: take the next v8 world as an immutable candidate, append births for
 * every new construction, and publish one new root. Any failure throws and the caller keeps the old root.
 */
function next(previous:ArchitectureProductionWorld,terrain:TerrainProductionWorld):ArchitectureProductionWorld {
 if(terrain===previous.terrain)return previous;
 const old=previous.architecture,all=listConstructions(terrain);
 if(all.length<old.births.length)fail('constructions disappeared from the recorded history');
 const {grammar,traditions}=old;
 const births=[...old.births,...all.slice(old.births.length).map(c=>birthOf(terrain,grammar,traditions,c))];
 // existing births must still describe the same constructions, in the same order (immutable past)
 for(let i=0;i<old.births.length;i++){const c=all[i]!,b=old.births[i]!;if(JSON.stringify([c.ref,c.source,c.use])!==JSON.stringify([b.ref,b.source,b.use]))fail('recorded construction changed at '+i);}
 return own({format:ARCHITECTURE_WORLD_FORMAT,status:'production',terrain,architecture:{...old,births}});
}
export async function advanceArchitectureWorld(world:ArchitectureProductionWorld,years:number,choices:'stop'|'automatic'='stop',options:{readonly stopAtNewRecord?:boolean}={}):Promise<ArchitectureProductionWorld>{
 knownArchitectureWorld(world);return next(world,await advanceTerrainProductionWorld(world.terrain,years,choices,options));
}
export async function chooseArchitectureWorld(world:ArchitectureProductionWorld,index:number|'random'):Promise<ArchitectureProductionWorld>{
 knownArchitectureWorld(world);return next(world,await chooseTerrainProductionWorld(world.terrain,index));
}

// ---- persistence (v9 envelope over a complete native v8 packet) ----
export async function prepareArchitectureSave(world:ArchitectureProductionWorld):Promise<ArchitectureProductionSave>{
 knownArchitectureWorld(world);
 const packet:ArchitectureProductionSave={format:'namonaki-world-save',version:9,schemaVersion:1,world:await prepareTerrainProductionSave(world.terrain),architecture:world.architecture};
 if(new TextEncoder().encode(JSON.stringify(packet)).length>terrainProductionMaxBytes)fail('save exceeds 16MiB');
 packets.set(deepFreeze(packet),world);return packet;
}
/** Native reader: validates the nested v8 packet with its own reader, then recomputes every birth. */
export async function validateArchitectureSave(raw:unknown):Promise<ArchitectureProductionSave>{
 if(raw&&typeof raw==='object'&&packets.has(raw))return raw as ArchitectureProductionSave;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('save must be an object');
 const d=JSON.parse(JSON.stringify(raw)) as Record<string,unknown>;
 if(new TextEncoder().encode(JSON.stringify(d)).length>terrainProductionMaxBytes)fail('save exceeds 16MiB');
 const keys=Object.keys(d).sort().join(',');
 if(keys!=='architecture,format,schemaVersion,version,world'||d.format!=='namonaki-world-save'||d.version!==9||d.schemaVersion!==1)fail('unknown v9 contract');
 const v8=await validateTerrainProductionSave(d.world),terrain=restoreTerrainProductionSave(v8);
 const expected=expectedArchitectureLedger(terrain);
 if(!sameLedger(expected,d.architecture as ArchitectureLedger))fail('recorded architecture does not match the history it claims');
 const world=own({format:ARCHITECTURE_WORLD_FORMAT,status:'production',terrain,architecture:expected});
 const packet=deepFreeze({format:'namonaki-world-save',version:9,schemaVersion:1,world:v8,architecture:expected} as ArchitectureProductionSave);
 packets.set(packet,world);return packet;
}
export function restoreArchitectureSave(packet:ArchitectureProductionSave):ArchitectureProductionWorld {return packets.get(packet)??fail('use a validated architecture packet');}
