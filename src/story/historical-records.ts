/**
 * Issue #39 D1: read-only history of the things a player can look into (facilities, housing blocks, bridges,
 * waterways; a ruin is a state of a facility or housing block, never a target of its own).
 *
 * - Reads only records the world already keeps (settlement building changes, housing events, the bridge ledger,
 *   production irrigation events, architecture births, the chronicle). Adds nothing to a save, never advances a
 *   world, never draws a random number. The index is a cache keyed by the source object.
 * - Every answer is for one confirmed year `y` (0..last confirmed year): only changes with `year <= y` are listed
 *   and only targets that already existed by `y` are listed, so a later year never leaks into an earlier view.
 * - A chronicle entry is linked only when its id is named by the record AND its year (and building / block) match.
 *   Waterway causes other than `chronicle` (land use, policy clock) are never presented as chronicle entries.
 * - `presence` is D1's part of the D0 §3 vocabulary. Whether a recorded target can be picked in the landscape
 *   (`visible` / `recorded-hidden`) needs the drawn pixels and is decided in D2, not here.
 */
import {lastObservedYear,type RecordEntry} from './engine.js';
import {housingAt,type HousingHistory,type HousingEventKind,type ResidentialBlock} from './housing-history.js';
import type {ChannelEvent,ChannelEventKind,ChannelStatus} from '../irrigation/review-types-v1.js';
import type {ArchitectureGeneratedSession} from './world-session.js';

export type HistoricalSiteId='river-bank'|'hill-side'|'coast-inlet';
export const historicalSiteIds:readonly HistoricalSiteId[]=Object.freeze(['river-bank','hill-side','coast-inlet']);
export type HistoricalTargetRef=
 |{readonly kind:'facility';readonly id:string}
 |{readonly kind:'housing-block';readonly blockId:string}
 |{readonly kind:'bridge';readonly id:string}
 |{readonly kind:'waterway';readonly systemId:string};
/**
 * - `recorded`: confirmed to exist in `y` (D2 splits it into visible / recorded-hidden by the drawn pixels).
 * - `not-yet-built`: confirmed to be built after `y`.
 * - `unknown`: no record says anything about it in `y` (records had not started, or no record of this id at all).
 * - `unsupported`: records exist but cannot be tied safely to this target (e.g. a bridge missing from its ledger).
 */
export type HistoricalPresence='recorded'|'not-yet-built'|'unknown'|'unsupported';
export type HistoricalSourceKind='building-change'|'bridge-record'|'housing-event'|'waterway-event';
export type HistoricalChangeKind=
 |'built'|'expanded'|'underused'|'vacated'|'damaged'|'ruined'|'abandoned'|'repaired'|'reused'
 |'maintained'|'paused'|'resumed'|'backfilled'
 /** A recorded state change of a facility / bridge that no chronicle entry confirms the reason of. */
 |'condition';
export interface HistoricalChange {
 readonly year:number;
 /** Order inside the target's history (the source's own order; housing / waterway `seq`). */
 readonly order:number;
 readonly sourceKind:HistoricalSourceKind;
 /** Housing: `blockId@year#seq`; facility / bridge: `id@year#n`; waterway: the channel event id. */
 readonly sourceId:string;
 readonly kind:HistoricalChangeKind;
 readonly label:string;
 /** State after the change, as text. */
 readonly condition:string;
 readonly linkedChronicleId?:string;
 /** Architecture generation that began with this change (rebuilds after ruin). */
 readonly generation?:number;
}
export interface HistoricalGeneration {
 readonly generation:number;readonly year:number;readonly kind:'built'|'rebuilt';
 readonly mode?:'old'|'current'|'mixed';readonly linkedChronicleId?:string;
}
export interface HistoricalSubject {
 readonly ref:HistoricalTargetRef;
 /** Site and kind only (e.g. 「川辺の橋」): safe to show in any year, unlike `title`, which names the construction year. */
 readonly name:string;
 /** Undefined only for an id no record knows. */
 readonly siteId:HistoricalSiteId|undefined;
 readonly observedYear:number;
 readonly presence:HistoricalPresence;
 readonly title:string;
 /** Confirmed first year (construction / first record); null when not known. */
 readonly firstYear:number|null;
 /** State in the observed year, or null unless `presence` is `recorded`. */
 readonly currentCondition:string|null;
 /** Changes with `year <= observedYear` only, oldest first. Empty unless `presence` is `recorded`. */
 readonly history:readonly HistoricalChange[];
 /** Architecture generations begun by `observedYear` (facilities and housing blocks with a recorded style). */
 readonly generations:readonly HistoricalGeneration[];
}

/** The parts of a world the history reads (structural, so tests can pass plain data). */
export interface HistoricalSource {
 readonly confirmedThrough:number;
 readonly history:readonly Pick<RecordEntry,'id'|'year'|'kind'|'buildingId'>[];
 /** Settlement ledgers in the order of `historicalSiteIds`. */
 readonly sites:readonly {readonly buildingChanges:readonly {readonly year:number;readonly building:{readonly id:string;readonly kind:string;readonly builtYear:number;readonly condition:string;readonly recordId?:string;readonly civic?:{readonly architectureStyle:string}}}[]}[];
 readonly housing?:HousingHistory;
 readonly bridges:readonly {readonly geometry:{readonly bridgeId:string};readonly builtYear:number;readonly sourceRecordId:string}[];
 readonly irrigation?:{readonly introducedYear:number;readonly confirmedThrough:number;readonly events:readonly ChannelEvent[]};
 readonly births:readonly {readonly ref:{readonly kind:'facility';readonly siteId:string;readonly id:string}|{readonly kind:'housing';readonly siteId:string;readonly blockId:string};
  readonly source:{readonly kind:'built'|'expanded'|'rebuilt';readonly year:number;readonly recordId?:string};readonly rebuild?:{readonly generation:number;readonly mode:'old'|'current'|'mixed'}}[];
}

const sources=new WeakMap<object,HistoricalSource>();
/** The history source of a live (v10) world. Cached per owned world; read-only. */
export function historicalSourceOf(session:ArchitectureGeneratedSession):HistoricalSource {
 const world=session.architecture;
 let s=sources.get(world);if(s)return s;
 const terrain=world.terrain,state=terrain.review.state,irrigation=terrain.irrigation;
 s=Object.freeze({
  confirmedThrough:Math.min(lastObservedYear(state),irrigation?.confirmedThrough??Infinity),
  history:state.history,sites:state.observation?.sites??[],housing:state.housing,
  bridges:terrain.review.bridgeReview?.bridges??[],irrigation,births:world.architecture.births,
 });
 sources.set(world,s);return s;
}

// ---- texts ----
const siteNames:Readonly<Record<HistoricalSiteId,string>>={'river-bank':'川辺','hill-side':'丘陵','coast-inlet':'入り江'};
const facilityNames:Readonly<Record<string,string>>={house:'家屋',hall:'集会所',workshop:'仕事場',market:'市',granary:'穀物庫'};
const civicNames:Readonly<Record<string,string>>={'great-hall':'大きな共同会堂','courtyard-hall':'中庭を囲む共同施設'};
const facilityConditions:Readonly<Record<string,string>>={intact:'建っている',damaged:'損傷している',ruined:'廃墟になっている'};
/** Only an intact deck is walked (withGeneratedBridgeAccess); a damaged bridge is never shown as passable. */
const bridgeConditions:Readonly<Record<string,string>>={intact:'渡ることができる',damaged:'損傷して渡れない',ruined:'廃墟となり渡れない'};
const waterwayConditions:Readonly<Record<ChannelStatus,string>>={active:'水が流れている',idle:'休止している',damaged:'傷み、水が止まっている',abandoned:'放棄されている',retired:'埋め戻されている'};
const facilityLabels:Readonly<Record<string,string>>={built:'建設',damaged:'損傷',abandoned:'使われなくなり廃墟となる',repaired:'修繕',reused:'再利用'};
const housingLabels:Readonly<Record<HousingEventKind,string>>={built:'建設',expanded:'増築',underused:'利用が減る',vacated:'空き家になる',damaged:'損傷',ruined:'廃墟となる',repaired:'修繕',reused:'再利用'};
const waterwayLabels:Readonly<Record<ChannelEventKind,string>>={built:'築造',maintained:'維持',paused:'休止',resumed:'再開',damaged:'損傷',repaired:'修繕',abandoned:'放棄',backfilled:'埋め戻し'};
/** A building record's kind and the condition it must leave (as checked for bridges by the bridge ledger). */
const buildingRecordKinds:Readonly<Record<string,{kind:HistoricalChangeKind;condition:string}>>={
 'building-built':{kind:'built',condition:'intact'},'building-damaged':{kind:'damaged',condition:'damaged'},
 'building-abandoned':{kind:'abandoned',condition:'ruined'},'building-repaired':{kind:'repaired',condition:'intact'},
 'building-reused':{kind:'reused',condition:'intact'},
};
function housingCondition(b:ResidentialBlock):string {
 if(b.condition==='ruined')return '廃墟になっている';
 const use={occupied:'住まわれている',underused:'利用が減っている',vacant:'空き家になっている'}[b.use];
 return b.condition==='damaged'?`損傷している（${use}）`:use;
}

// ---- index (all years; queries filter by year) ----
interface Entry {
 readonly ref:HistoricalTargetRef;readonly siteId:HistoricalSiteId;readonly name:string;readonly title:string;
 /** First confirmed year; null when the records cannot be tied to this target. */
 readonly firstYear:number|null;readonly unsupported:boolean;
 /** Records began after this year (e.g. irrigation introduction): earlier years are unknown, not "not built". */
 readonly recordsFrom:number;
 readonly changes:readonly HistoricalChange[];readonly generations:readonly HistoricalGeneration[];
}
interface Index {readonly entries:ReadonlyMap<string,Entry>;readonly bySite:ReadonlyMap<HistoricalSiteId,readonly Entry[]>}
const indexes=new WeakMap<object,Index>();
const keyOf=(ref:HistoricalTargetRef)=>ref.kind==='housing-block'?'housing-block\u0000'+ref.blockId:ref.kind==='waterway'?'waterway\u0000'+ref.systemId:ref.kind+'\u0000'+ref.id;
const fail=(m:string):never=>{throw Error('historical records: '+m);};

function buildIndex(source:HistoricalSource):Index {
 const records=new Map(source.history.map(r=>[r.id,r]));
 if(records.size!==source.history.length)fail('duplicate chronicle id');
 const entries=new Map<string,Entry>();
 const add=(e:Entry)=>{const k=keyOf(e.ref);if(entries.has(k))fail('target recorded twice '+k);entries.set(k,e);};
 const generationsOf=(siteId:string,id:string,kind:'facility'|'housing')=>{
  const list:HistoricalGeneration[]=[];
  for(const b of source.births){
   if(b.ref.kind!==kind||b.ref.siteId!==siteId||(b.ref.kind==='facility'?b.ref.id:b.ref.blockId)!==id||b.source.kind==='expanded')continue;
   const linked=b.source.recordId!==undefined&&records.get(b.source.recordId)?.year===b.source.year?b.source.recordId:undefined;
   list.push(Object.freeze({generation:b.source.kind==='rebuilt'?(b.rebuild?.generation??fail('rebuild without generation '+id)):1,year:b.source.year,kind:b.source.kind,
    ...(b.rebuild?{mode:b.rebuild.mode}:{}),...(linked?{linkedChronicleId:linked}:{})}));
  }
  return Object.freeze(list.sort((a,b)=>a.year-b.year||a.generation-b.generation));
 };
 // facilities and bridges: the settlement ledger's building changes (fields are land use, not a D1 target)
 const bridgeLedger=new Map(source.bridges.map(b=>[b.geometry.bridgeId,b]));
 source.sites.forEach((site,index)=>{
  const siteId=historicalSiteIds[index]??fail('unknown site index '+index);
  const byId=new Map<string,{year:number;building:HistoricalSource['sites'][number]['buildingChanges'][number]['building']}[]>();
  for(const c of site.buildingChanges){if(c.building.kind==='field')continue;const l=byId.get(c.building.id)??[];l.push(c);byId.set(c.building.id,l);}
  for(const [id,list] of byId){
   const bridge=list[0]!.building.kind==='bridge';
   if(list.some(c=>(c.building.kind==='bridge')!==bridge))fail('building kind changed '+id);
   const ref:HistoricalTargetRef=bridge?{kind:'bridge',id}:{kind:'facility',id};
   const ledger=bridge?bridgeLedger.get(id):undefined,first=list[0]!;
   // a bridge is tied to its ledger entry by birth year and source record; otherwise it is not presented
   const unsupported=bridge&&(!ledger||ledger.builtYear!==first.year||first.building.recordId!==ledger.sourceRecordId||first.building.builtYear!==first.year);
   const generations=bridge?[]:generationsOf(siteId,id,'facility');
   const conditions=bridge?bridgeConditions:facilityConditions;
   const changes=list.map((c,n):HistoricalChange=>{
    const b=c.building,record=b.recordId!==undefined?records.get(b.recordId):undefined;
    const meaning=record&&record.year===c.year&&record.buildingId===id?buildingRecordKinds[record.kind??'']:undefined;
    const linked=meaning&&meaning.condition===b.condition?record!.id:undefined;
    const kind:HistoricalChangeKind=linked?meaning!.kind:n===0&&b.builtYear===c.year&&b.condition==='intact'?'built':'condition';
    const generation=generations.find(g=>g.kind==='rebuilt'&&g.year===c.year&&g.linkedChronicleId!==undefined&&g.linkedChronicleId===linked)?.generation;
    const condition=conditions[b.condition]??fail('unknown building condition '+b.condition);
    const label=kind==='condition'?'状態の記録：'+condition:facilityLabels[kind]+(generation?`（建て直し・第${generation}世代）`:'');
    return Object.freeze({year:c.year,order:n,sourceKind:bridge?'bridge-record':'building-change',sourceId:`${id}@${c.year}#${n}`,kind,label,condition,
     ...(linked?{linkedChronicleId:linked}:{}),...(generation?{generation}:{})});
   });
   const name=bridge?'橋':first.building.civic?civicNames[first.building.civic.architectureStyle]??'共同施設':facilityNames[first.building.kind]??fail('unknown facility kind '+first.building.kind);
   add(Object.freeze({ref:Object.freeze(ref),siteId,name:`${siteNames[siteId]}の${name}`,title:`${siteNames[siteId]}の${name}（${first.building.builtYear}年建設）`,
    firstYear:unsupported?null:first.year,unsupported,recordsFrom:0,changes:Object.freeze(changes),generations}));
  }
 });
 // housing blocks: the housing events, validated by the housing reader first (fails closed on a broken history)
 if(source.housing){
  housingAt(source.housing,Math.max(source.housing.introducedYear,source.confirmedThrough));
  const byBlock=new Map<string,HousingEvent[]>();
  for(const e of source.housing.events){const l=byBlock.get(e.blockId)??[];l.push(e);byBlock.set(e.blockId,l);}
  for(const [blockId,list] of byBlock){
   const first=list[0]!,siteId=first.after.siteId,generations=generationsOf(siteId,blockId,'housing');
   if(list.some(e=>e.after.siteId!==siteId))fail('housing block changed site '+blockId);
   const changes=list.map((e):HistoricalChange=>{
    const record=e.causeRecordId!==undefined?records.get(e.causeRecordId):undefined;
    const linked=record&&record.year===e.year&&record.buildingId===blockId?record.id:undefined;
    const generation=generations.find(g=>g.kind==='rebuilt'&&g.year===e.year&&g.linkedChronicleId!==undefined&&g.linkedChronicleId===linked)?.generation;
    return Object.freeze({year:e.year,order:e.seq,sourceKind:'housing-event' as const,sourceId:`${blockId}@${e.year}#${e.seq}`,kind:e.kind,
     label:housingLabels[e.kind]+(generation?`（建て直し・第${generation}世代）`:''),condition:housingCondition(e.after),
     ...(linked?{linkedChronicleId:linked}:{}),...(generation?{generation}:{})});
   });
   add(Object.freeze({ref:Object.freeze({kind:'housing-block',blockId}),siteId,name:`${siteNames[siteId]}の住宅街区`,title:`${siteNames[siteId]}の住宅街区（${first.after.builtYear}年建設）`,
    firstYear:first.year,unsupported:false,recordsFrom:source.housing.legacyUntracked?source.housing.introducedYear:0,changes:Object.freeze(changes),generations}));
  }
 }
 // waterways: production irrigation (river bank only); a chronicle cause is linked only to an entry of that year
 if(source.irrigation){
  const i=source.irrigation,bySystem=new Map<string,ChannelEvent[]>();
  for(const e of i.events){const l=bySystem.get(e.systemId)??[];l.push(e);bySystem.set(e.systemId,l);}
  for(const [systemId,list] of bySystem){
   const changes=list.map((e):HistoricalChange=>{
    const linked=e.cause.kind==='chronicle'&&records.get(e.cause.recordId)?.year===e.year?e.cause.recordId:undefined;
    return Object.freeze({year:e.year,order:e.seq,sourceKind:'waterway-event' as const,sourceId:e.id,kind:e.kind,label:waterwayLabels[e.kind],
     condition:waterwayConditions[e.after.status],...(linked?{linkedChronicleId:linked}:{})});
   });
   const first=list[0]!;
   add(Object.freeze({ref:Object.freeze({kind:'waterway',systemId}),siteId:'river-bank',name:`${siteNames['river-bank']}の水路`,title:`${siteNames['river-bank']}の水路（${first.year}年築造）`,
    firstYear:first.kind==='built'?first.year:null,unsupported:first.kind!=='built',recordsFrom:i.introducedYear+1,changes:Object.freeze(changes),generations:Object.freeze([])}));
  }
 }
 const order:Readonly<Record<HistoricalTargetRef['kind'],number>>={facility:0,bridge:1,'housing-block':2,waterway:3};
 const bySite=new Map<HistoricalSiteId,Entry[]>(historicalSiteIds.map(s=>[s,[]]));
 for(const e of entries.values())bySite.get(e.siteId)!.push(e);
 for(const list of bySite.values())list.sort((a,b)=>order[a.ref.kind]-order[b.ref.kind]||(a.firstYear??Infinity)-(b.firstYear??Infinity)||keyOf(a.ref).localeCompare(keyOf(b.ref)));
 return {entries,bySite};
}
type HousingEvent=HousingHistory['events'][number];
function indexOf(source:HistoricalSource):Index {let i=indexes.get(source);if(!i){i=buildIndex(source);indexes.set(source,i);}return i;}

function checkYear(source:HistoricalSource,year:number):void {
 if(!Number.isSafeInteger(year)||year<0||year>source.confirmedThrough)throw RangeError('historical records: unconfirmed year '+year);
}
function subjectOf(entry:Entry,year:number):HistoricalSubject {
 const base={ref:entry.ref,siteId:entry.siteId,observedYear:year,name:entry.name,title:entry.title,firstYear:entry.firstYear};
 if(entry.unsupported)return Object.freeze({...base,presence:'unsupported',currentCondition:null,history:Object.freeze([]),generations:Object.freeze([])});
 if(year<entry.recordsFrom)return Object.freeze({...base,presence:'unknown',currentCondition:null,history:Object.freeze([]),generations:Object.freeze([])});
 if(entry.firstYear===null||entry.firstYear>year)return Object.freeze({...base,presence:'not-yet-built',currentCondition:null,history:Object.freeze([]),generations:Object.freeze([])});
 const history=entry.changes.filter(c=>c.year<=year);
 return Object.freeze({...base,presence:'recorded',currentCondition:history.at(-1)!.condition,history:Object.freeze(history),
  generations:Object.freeze(entry.generations.filter(g=>g.year<=year))});
}

/**
 * The history of one target as confirmed in `year`. A target no record knows is `unknown`.
 * Throws for a year that is not confirmed (negative, fractional, or after the last confirmed year).
 */
export function historicalSubjectAt(source:HistoricalSource,ref:HistoricalTargetRef,year:number):HistoricalSubject {
 checkYear(source,year);
 const entry=indexOf(source).entries.get(keyOf(ref));
 if(entry)return subjectOf(entry,year);
 return Object.freeze({ref:Object.freeze({...ref}),siteId:undefined,observedYear:year,presence:'unknown',name:'記録のない対象',title:'記録のない対象',firstYear:null,
  currentCondition:null,history:Object.freeze([]),generations:Object.freeze([])});
}

/**
 * "この土地の記録から調べる": every target of a site recorded by `year` (including ones the landscape may hide,
 * such as a backfilled waterway). Targets first recorded after `year` are not listed. Unsupported targets are
 * listed with their presence so the list never silently drops a record.
 */
export function historicalTargetsAt(source:HistoricalSource,siteId:HistoricalSiteId,year:number):readonly HistoricalSubject[] {
 checkYear(source,year);
 const list=indexOf(source).bySite.get(siteId)??fail('unknown site '+siteId);
 const out:HistoricalSubject[]=[];
 for(const e of list){const s=subjectOf(e,year);if(s.presence==='recorded'||s.presence==='unsupported'&&e.changes[0]!.year<=year)out.push(s);}
 return Object.freeze(out);
}

/** A drawn roof part belongs to its housing block: the part is a drawing unit, never a house of its own. */
export function housingTargetOfRoofPart(part:{readonly blockId:string}):HistoricalTargetRef {
 if(typeof part.blockId!=='string'||!part.blockId)fail('roof part without a block');
 return Object.freeze({kind:'housing-block',blockId:part.blockId});
}
export function sameHistoricalTarget(a:HistoricalTargetRef,b:HistoricalTargetRef):boolean {return keyOf(a)===keyOf(b);}
