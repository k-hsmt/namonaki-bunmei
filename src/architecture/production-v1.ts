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
 * - D2-b2: every birth also records its air-space envelope (architecture-envelope-v2, from the D2-c
 *   drawing geometry) and the fallback stage that made it fit. A construction is checked against the
 *   envelopes of constructions from EARLIER YEARS in its site, never the same year, so a construction
 *   added in an already recorded year (e.g. resolving a choice) cannot change an earlier record.
 *   Only the excess over the minimal form is tested (Human decision A), so the last stage always fits;
 *   a constraint HOLD still fails the advance closed and the old root is kept.
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
import {architecturePolicy,createWorldGrammar,createRegionalTradition,deriveBirthStyle,
 type ArchitectureSite,type WorldArchitecturalGrammar,type RegionalArchitecturalTradition,type BirthStyle,type BuildingRef,type BirthSource} from './grammar-v1.js';
import {ENVELOPE_ID,facilityAirspace,housingAirspace,airspaceConflict,minimalForm,withExcess,type AirspaceRect} from './airspace-v1.js';
import type {ResidentialBlock} from '../story/housing-history.js';
export type RecordedBirth=BirthStyle<AirspaceRect>;
import {appendInteraction,emptyInteraction,verifyInteraction,interactionHash,type InteractionLedger} from './interaction-v1.js';
import type {InteractionCaptureInternal} from '../story/economy-observer.js';
import {TECHNOLOGY_ID,capabilityEventsFor,technologiesAt,type CapabilityEvent} from './technology-v1.js';
import {CHANGE_ID,CHANGE_PERIOD,traditionChangesFor,traditionAt,type TraditionChange,type WindowFacts} from './change-v1.js';
import type {Use} from './vocab-v1.js';

export const ARCHITECTURE_WORLD_FORMAT='architecture-production-world-v1';
const sites:readonly ArchitectureSite[]=['river-bank','hill-side','coast-inlet'];
export interface ArchitectureLedger {
 readonly format:'architecture-ledger-v1';readonly schemaVersion:5;readonly policy:typeof architecturePolicy;
 /** D2-b2: births carry their air-space envelope (schema 2; schema 1 of D2-b1 was never released). */
 readonly envelope:typeof ENVELOPE_ID;
 readonly grammar:WorldArchitecturalGrammar;readonly traditions:readonly RegionalArchitecturalTradition[];
 readonly births:readonly RecordedBirth[];
 /** D3-a (schema 3): inter-district interaction observed while v8 advanced. Checked, not recomputed, on load. */
 readonly interaction:InteractionLedger;
 /** D3-b (schema 4): tradition changes every 25 years (architecture-change-v1). Recomputed on load. */
 readonly change:typeof CHANGE_ID;readonly traditionChanges:readonly TraditionChange[];
 /** D3-c (schema 5): district capabilities (architecture-technology-v1). Recomputed on load. */
 readonly technology:typeof TECHNOLOGY_ID;readonly capabilityEvents:readonly CapabilityEvent[];
}
export interface ArchitectureProductionWorld {
 readonly format:typeof ARCHITECTURE_WORLD_FORMAT;readonly status:'production';
 readonly terrain:TerrainProductionWorld;readonly architecture:ArchitectureLedger;
}
export interface ArchitectureProductionSave {
 readonly format:'namonaki-world-save';readonly version:9;readonly schemaVersion:2;
 readonly world:TerrainProductionSave;readonly architecture:ArchitectureLedger;
 /** SHA-256 commitment over architecture.interaction (corruption check, like v8's payloadHash). */
 readonly interactionHash:string;
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
export interface Construction {readonly ref:BuildingRef;readonly source:BirthSource;readonly use:Use;readonly plot:Plot;readonly block?:ResidentialBlock}
/**
 * Lists every construction in the recorded history, in the fixed processing order of design §5.3:
 * year → site → facility before housing → id → seq. Inconsistent records fail closed.
 */
export function listConstructions(world:TerrainProductionWorld):Construction[] {
 const r=world.review,state=r.state,out:Construction[]=[];
 const observed=state.observation?.sites??fail('missing settlement ledger');
 // The v8 settlement ledger is ordered like story/population.ts `settlements` (river-bank, hill-side,
 // coast-inlet). Verify it from the ledger itself instead of assuming the index order.
 if(observed.length!==sites.length)fail('settlement ledger must have three sites');
 const ledgerSiteOf=(id:string)=>{const found=observed.map((l,i)=>l.buildingChanges.some(c=>c.building.id===id)?i:-1).filter(i=>i>=0);
  if(found.length>1)fail('building '+id+' appears in more than one site ledger');return found[0];};
 for(const p of r.placements){
  if(p.kind==='field')continue;
  const use=facilityUse[p.kind]??fail('unknown facility kind '+p.kind);
  const siteIndex=sites.indexOf(p.site as ArchitectureSite);if(siteIndex<0)fail('unknown site '+p.site);
  const ledger=ledgerSiteOf(p.objectId);
  if(ledger!==undefined&&ledger!==siteIndex)fail('facility '+p.objectId+' is placed in '+p.site+' but recorded in another site ledger');
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
 // Keyed by site and block so the check does not depend on block ids being unique across sites.
 const counts=new Map<string,number>();
 for(const e of state.housing?.events??[]){
  if(e.kind!=='built'&&e.kind!=='expanded'){continue;}
  if(e.after.blockId!==e.blockId)fail('housing event block mismatch '+e.blockId);
  const blockKey=e.after.siteId+'\u0000'+e.blockId,before=counts.get(blockKey)??0,after=e.after.housingCount;
  if(e.kind==='built'&&before!==0||e.kind==='expanded'&&(before===0||after<=before))fail('housing parts out of order for '+e.blockId);
  counts.set(blockKey,after);
  const use=housingUse[e.after.styleId]??fail('unknown housing style '+e.after.styleId);
  out.push({ref:{kind:'housing',siteId:e.after.siteId,blockId:e.blockId,parts:{from:before,to:after}},source:{kind:e.kind,year:e.year,seq:e.seq,...(e.causeRecordId?{recordId:e.causeRecordId}:{})},use,plot:e.after.footprint,block:e.after});
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
function birthOf(world:TerrainProductionWorld,grammar:WorldArchitecturalGrammar,traditions:readonly RegionalArchitecturalTradition[],c:Construction,earlier:readonly AirspaceRect[],changes:readonly TraditionChange[],capabilities:readonly CapabilityEvent[]):RecordedBirth {
 // D3-b: the tradition in force in the construction year, not the year-0 tradition.
 const initial=traditions[sites.indexOf(c.ref.siteId)]!,now=traditionAt(grammar,initial,changes,c.source.year);
 const tradition:RegionalArchitecturalTradition={...initial,choices:now.choices,shared:now.shared as WorldArchitecturalGrammar['shared']};
 // Design §5.2 input 2: the confirmed terrain of the construction year, never the latest terrain.
 const raster=readOwnedRecordPhysics(terrainSitePhysics(resolveTerrainAtYear(world.terrainHistory,c.source.year),c.ref.siteId));
 const decks=(world.review.bridgeReview?.bridges??[]).filter(b=>b.geometry.siteId===c.ref.siteId&&b.builtYear<=c.source.year).map(b=>b.geometry.deck);
 const civic=c.ref.kind==='facility'?c.ref.civic?.style:undefined;
 const rectOf=(spec:Parameters<typeof facilityAirspace>[0])=>c.ref.kind==='housing'?housingAirspace(spec,c.block??fail('housing construction without its block')):facilityAirspace(spec,c.plot,civic);
 // Human decision A on D2-b2: only the excess over the minimal form is tested.
 const measure=(spec:Parameters<typeof facilityAirspace>[0])=>withExcess(rectOf(spec),rectOf(minimalForm(spec)));
 const r=deriveBirthStyle({grammar,tradition,ref:c.ref,source:c.source,use:c.use,plot:measurePlotAdaptation(raster,c.plot),technologies:technologiesAt(capabilities,c.ref.siteId,c.source.year)},
  e=>airspaceConflict(e,{earlier,decks,raster,plot:c.plot})===null,measure);
 if(r.status!=='ok')return fail('birth HOLD ('+r.reason+') for '+JSON.stringify(c.ref)+': '+r.detail);
 return r;
}
/** Births in construction order. Each is checked against the envelopes of earlier years in its site. */
function birthsFor(world:TerrainProductionWorld,grammar:WorldArchitecturalGrammar,traditions:readonly RegionalArchitecturalTradition[],changes:readonly TraditionChange[],capabilities:readonly CapabilityEvent[]):RecordedBirth[] {
 const out:RecordedBirth[]=[],bySite=new Map<string,{year:number;rect:AirspaceRect}[]>();
 for(const c of listConstructions(world)){
  const site=bySite.get(c.ref.siteId)??[];
  const b=birthOf(world,grammar,traditions,c,site.filter(x=>x.year<c.source.year).map(x=>x.rect),changes,capabilities);
  site.push({year:c.source.year,rect:b.envelope});bySite.set(c.ref.siteId,site);out.push(b);
 }
 return out;
}
/** The complete ledger the recorded v8 history implies. Pure in the v8 world; used by the writer and the reader. */
/** Hazards that reach each district, as v8's housing lifecycle applies them. */
const hazardSites:Readonly<Record<string,readonly ArchitectureSite[]>>={earthquake:['river-bank','hill-side','coast-inlet'],flood:['river-bank'],fire:['river-bank'],storm:['coast-inlet']};
/** Window facts per district from confirmed v8 records: constructions, repairs and disasters. */
function factsOf(world:TerrainProductionWorld):(site:ArchitectureSite,year:number)=>WindowFacts {
 const r=world.review,siteOf=new Map<string,ArchitectureSite>();
 for(const p of r.placements)siteOf.set(p.objectId,p.site as ArchitectureSite);
 for(const e of r.state.housing?.events??[])siteOf.set(e.blockId,e.after.siteId);
 const events:{site:ArchitectureSite;year:number;id:string;kind:'work'|'disaster'}[]=[];
 for(const c of listConstructions(world))events.push({site:c.ref.siteId,year:c.source.year,id:c.source.recordId??'',kind:'work'});
 for(const h of r.state.history){
  if((h.kind==='building-repaired'||h.kind==='housing-repaired')&&h.buildingId){const site=siteOf.get(h.buildingId);if(site)events.push({site,year:h.year,id:h.id,kind:'work'});}
  else if(h.kind&&hazardSites[h.kind])for(const site of hazardSites[h.kind]!)events.push({site,year:h.year,id:h.id,kind:'disaster'});
 }
 return (site,year)=>{
  const inWindow=events.filter(e=>e.site===site&&e.year>year-CHANGE_PERIOD&&e.year<=year);
  const work=inWindow.filter(e=>e.kind==='work');
  return {experience:work.length,records:work.map(e=>e.id).filter(Boolean),disasters:inWindow.filter(e=>e.kind==='disaster').length};
 };
}
/** Tradition changes (D3-b) and capability events (D3-c) implied by the confirmed records. */
function changesFor(world:TerrainProductionWorld,grammar:WorldArchitecturalGrammar,traditions:readonly RegionalArchitecturalTradition[],interaction:InteractionLedger):{traditionChanges:TraditionChange[];capabilityEvents:CapabilityEvent[]} {
 const seed=world.review.state.seed,confirmedThrough=interaction.confirmedThrough,facts=factsOf(world);
 const traditionChanges=traditionChangesFor({seed,confirmedThrough,grammar,initial:traditions,interaction,facts});
 // town condition: a market and a workshop built in the district (design §3.3 scale; see technology-v1)
 const built=listConstructions(world).filter(c=>c.ref.kind==='facility');
 const first=(site:ArchitectureSite,use:Use)=>built.find(c=>c.ref.siteId===site&&c.use===use)?.source.year??Infinity;
 const townFrom=new Map(sites.map(site=>[site,Math.max(first(site,'market'),first(site,'workshop'))]));
 const capabilityEvents=capabilityEventsFor({seed,confirmedThrough,grammar,initial:traditions,changes:traditionChanges,interaction,facts,town:(site,year)=>townFrom.get(site)!<=year});
 return {traditionChanges,capabilityEvents};
}
/**
 * The ledger the recorded v8 history implies, with the given observed interaction (which cannot be
 * recomputed from the v8 world). Omitted, an empty interaction is used: callers that compare births only.
 */
export function expectedArchitectureLedger(world:TerrainProductionWorld,interaction:InteractionLedger=emptyInteraction(world.review.state.year)):ArchitectureLedger {
 knownTerrainProductionWorldInternal(world);
 const {grammar,traditions}=grammarAndTraditions(world);
 const {traditionChanges,capabilityEvents}=changesFor(world,grammar,traditions,interaction);
 return {format:'architecture-ledger-v1',schemaVersion:5,policy:architecturePolicy,envelope:ENVELOPE_ID,grammar,traditions,
  births:birthsFor(world,grammar,traditions,traditionChanges,capabilityEvents),interaction,change:CHANGE_ID,traditionChanges,technology:TECHNOLOGY_ID,capabilityEvents};
}
const sameLedger=(a:ArchitectureLedger,b:ArchitectureLedger)=>JSON.stringify(a)===JSON.stringify(b);

// ---- lifecycle ----
/** New worlds only: the owned v8 world must still be at year 0 with nothing pending. */
export function introduceArchitectureProduction(terrain:TerrainProductionWorld):ArchitectureProductionWorld {
 knownTerrainProductionWorldInternal(terrain);
 if(terrain.review.state.year!==0||terrain.review.state.pending||terrain.terrainDevelopment.introducedYear!==0)fail('architecture starts only with a new world at year 0');
 return own({format:ARCHITECTURE_WORLD_FORMAT,status:'production',terrain,architecture:expectedArchitectureLedger(terrain,emptyInteraction(0))});
}
/**
 * Design §5.3 update boundary: take the next v8 world as an immutable candidate, append births for
 * every new construction, and publish one new root. Any failure throws and the caller keeps the old root.
 */
/**
 * Merges a full recomputation with the previous ledger. New constructions may sort between earlier
 * ones of the same year (e.g. when resolving a pending choice adds a construction in that year), so
 * the past is checked as a set: every earlier birth must reappear byte-identical, features included.
 * A full recomputation costs a few milliseconds (D2-b1 audit), so nothing is appended blindly.
 */
export function mergeBirths<B extends {readonly ref:BuildingRef;readonly source:BirthSource}>(previous:readonly B[],recomputed:readonly B[]):readonly B[] {
 const key=(b:B)=>JSON.stringify([b.ref,b.source]);
 const now=new Map(recomputed.map(b=>[key(b),JSON.stringify(b)]));
 if(now.size!==recomputed.length)fail('duplicate construction in the recorded history');
 for(const b of previous){
  const again=now.get(key(b));
  if(again===undefined)fail('a recorded construction disappeared: '+key(b));
  if(again!==JSON.stringify(b))fail('a recorded birth style changed: '+key(b));
 }
 return recomputed;
}
function next(previous:ArchitectureProductionWorld,terrain:TerrainProductionWorld,captures:readonly InteractionCaptureInternal[]):ArchitectureProductionWorld {
 if(terrain===previous.terrain)return previous;
 const old=previous.architecture,{grammar,traditions}=old;
 const interactionNow=appendInteraction(old.interaction,captures),{traditionChanges,capabilityEvents}=changesFor(terrain,grammar,traditions,interactionNow);
 // changes and capability events already recorded must reappear unchanged (decided only from confirmed years)
 if(JSON.stringify(traditionChanges.slice(0,old.traditionChanges.length))!==JSON.stringify(old.traditionChanges))fail('a recorded tradition change changed');
 if(JSON.stringify(capabilityEvents.slice(0,old.capabilityEvents.length))!==JSON.stringify(old.capabilityEvents))fail('a recorded capability event changed');
 const recomputed=birthsFor(terrain,grammar,traditions,traditionChanges,capabilityEvents);
 const interaction=interactionNow;verifyInteraction(interaction,terrain,0);
 return own({format:ARCHITECTURE_WORLD_FORMAT,status:'production',terrain,architecture:{...old,births:mergeBirths(old.births,recomputed),interaction,traditionChanges,capabilityEvents}});
}
export async function advanceArchitectureWorld(world:ArchitectureProductionWorld,years:number,choices:'stop'|'automatic'='stop',options:{readonly stopAtNewRecord?:boolean}={}):Promise<ArchitectureProductionWorld>{
 knownArchitectureWorld(world);const captures:InteractionCaptureInternal[]=[];
 return next(world,await advanceTerrainProductionWorld(world.terrain,years,choices,options,c=>{captures.push(c);}),captures);
}
export async function chooseArchitectureWorld(world:ArchitectureProductionWorld,index:number|'random'):Promise<ArchitectureProductionWorld>{
 knownArchitectureWorld(world);const captures:InteractionCaptureInternal[]=[];
 return next(world,await chooseTerrainProductionWorld(world.terrain,index,undefined,c=>{captures.push(c);}),captures);
}

// ---- persistence (v9 envelope over a complete native v8 packet) ----
export async function prepareArchitectureSave(world:ArchitectureProductionWorld):Promise<ArchitectureProductionSave>{
 knownArchitectureWorld(world);
 const packet:ArchitectureProductionSave={format:'namonaki-world-save',version:9,schemaVersion:2,world:await prepareTerrainProductionSave(world.terrain),architecture:world.architecture,interactionHash:await interactionHash(world.architecture.interaction)};
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
 if(keys!=='architecture,format,interactionHash,schemaVersion,version,world'||d.format!=='namonaki-world-save'||d.version!==9||d.schemaVersion!==2)fail('unknown v9 contract');
 const v8=await validateTerrainProductionSave(d.world),terrain=restoreTerrainProductionSave(v8);
 const saved=d.architecture as ArchitectureLedger,interaction=saved?.interaction??fail('missing interaction');
 if(typeof d.interactionHash!=='string'||await interactionHash(interaction)!==d.interactionHash)fail('interaction commitment does not match');
 verifyInteraction(interaction,terrain,0);
 const expected=expectedArchitectureLedger(terrain,interaction);
 if(!sameLedger(expected,saved))fail('recorded architecture does not match the history it claims');
 const world=own({format:ARCHITECTURE_WORLD_FORMAT,status:'production',terrain,architecture:expected});
 const packet=deepFreeze({format:'namonaki-world-save',version:9,schemaVersion:2,world:v8,architecture:expected,interactionHash:d.interactionHash} as ArchitectureProductionSave);
 packets.set(packet,world);return packet;
}
export function restoreArchitectureSave(packet:ArchitectureProductionSave):ArchitectureProductionWorld {return packets.get(packet)??fail('use a validated architecture packet');}
