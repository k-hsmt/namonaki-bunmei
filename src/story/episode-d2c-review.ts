/**
 * Issue #40 D2c: the common frame of historical episodes (review-only, ruleId civilization-episodes-d2c-review).
 *
 * D0 §4.1 / §8 / §9. Used only through the D2a review event policy (createEventPolicyD2a(..., {episodes})); production
 * never passes it. The frame owns what every system (D3a food, D3b trade, D3c recovery, D3d society) shares:
 *  - the typed history: an append-only list of transitions (started, reassessed, response-started / -failed / -changed,
 *    resolved, abandoned), each with its evidence (existing record ids, ledger keys and years, other episodes). It is the
 *    only canonical store: the active episodes are rebuilt from it and the kept index must equal the rebuild;
 *  - the annual commit: once per year, at the end of finishYear (after the year's ledgers are committed), reading the
 *    confirmed facts of that year and before. A pending branch defers it to the choice (the year is not committed);
 *  - the rules: at most one active episode per kind; a recurrence is a new id; one transition per episode per year; no
 *    transition after the end; a response can fail or change only while it runs; evidence must exist and never come
 *    from a later year; an origin record starts at most one episode; a parent is an earlier episode;
 *  - nothing else: episodes do not write the civilization (no effect, no RNG). A system's effects come later as action
 *    candidates of its own (D3), never by copying population, food, trade or buildings into the episode.
 * A definition sees the facts and the active episode and returns at most one transition; the state it keeps is the
 * `state` of its last transition (a kind-specific, JSON-plain value), so unchanged years store nothing.
 */
import type {CivilizationState,RecordEntry} from './engine.js';

export const EPISODE_FRAMEWORK_D2C_ID='civilization-episodes-d2c-review' as const;
export const EPISODE_KINDS=Object.freeze(['food','trade','recovery','society'] as const);
export type EpisodeKind=typeof EPISODE_KINDS[number];
export type EpisodeStatus='active'|'resolved'|'abandoned';
export type EpisodeTransitionKind='started'|'reassessed'|'response-started'|'response-failed'|'response-changed'|'resolved'|'abandoned';
/** Typed reference to what a transition was decided on. */
export type EvidenceRef=
 |{readonly type:'record';readonly id:string}
 |{readonly type:'ledger';readonly key:string;readonly year:number}
 |{readonly type:'episode';readonly id:string};
export type EpisodeStateValue=null|boolean|number|string|readonly EpisodeStateValue[]|{readonly [key:string]:EpisodeStateValue};
export interface EpisodeTransition {
 readonly id:string;readonly episodeId:string;readonly episodeKind:EpisodeKind;
 readonly year:number;readonly seq:number;readonly kind:EpisodeTransitionKind;
 readonly evidence:readonly EvidenceRef[];
 /** The definition's state after this transition (kind-specific). */
 readonly state:EpisodeStateValue;
 /** Why it ended, failed or changed (a stable key of the definition), when it did. */
 readonly reason?:string;
 /** Only on `started`: the earlier episode this one follows from (D0 §4.1). */
 readonly parentEpisodeId?:string;
}
export interface ActiveEpisode {
 readonly id:string;readonly kind:EpisodeKind;readonly startedYear:number;readonly originRecordIds:readonly string[];
 readonly lastChangedYear:number;readonly response:'none'|'running'|'failed';readonly transitions:number;
 readonly state:EpisodeStateValue;
}
export interface EpisodeStore {
 readonly ruleId:typeof EPISODE_FRAMEWORK_D2C_ID;readonly definitionSet:string;
 committedThrough:number;transitions:EpisodeTransition[];
 active:Partial<Record<EpisodeKind,ActiveEpisode>>;
}
/** The confirmed facts of the year being committed (read-only for definitions). */
export interface EpisodeYear {
 readonly year:number;readonly state:Readonly<CivilizationState>;
 /** Records of this year, in order. */
 readonly records:readonly RecordEntry[];
 readonly record:(id:string)=>RecordEntry|undefined;
}
export type EpisodeProposal=
 {readonly kind:Exclude<EpisodeTransitionKind,'started'>;readonly evidence:readonly EvidenceRef[];readonly state:EpisodeStateValue;readonly reason?:string};
export interface EpisodeStart {readonly evidence:readonly EvidenceRef[];readonly state:EpisodeStateValue;readonly parentEpisodeId?:string}
export interface EpisodeDefinition {
 readonly kind:EpisodeKind;readonly definitionId:string;
 /** With no active episode of this kind: whether one starts this year (its origin is the record evidence). */
 readonly start:(year:EpisodeYear,lastEnded:Readonly<{id:string;year:number;status:EpisodeStatus}>|null)=>EpisodeStart|null;
 /** With an active episode: at most one transition this year. */
 readonly advance:(year:EpisodeYear,episode:ActiveEpisode)=>EpisodeProposal|null;
}
export interface EpisodeDefinitionSet {readonly id:string;readonly definitions:readonly EpisodeDefinition[]}

const fail=(m:string):never=>{throw Error('episodes: '+m);};
const terminal=(k:EpisodeTransitionKind)=>k==='resolved'||k==='abandoned';
const sets=new WeakSet<object>();
/** Definition sets are made here only (one per kind at most, in EPISODE_KINDS order). */
export function defineEpisodeSet(id:string,definitions:readonly EpisodeDefinition[]):EpisodeDefinitionSet {
 if(!/^[a-z0-9-]+$/.test(id))fail('invalid definition set id');
 const kinds=definitions.map(d=>d.kind);
 if(kinds.some(k=>!EPISODE_KINDS.includes(k))||new Set(kinds).size!==kinds.length)fail('one definition per kind');
 const ordered=[...definitions].sort((a,b)=>EPISODE_KINDS.indexOf(a.kind)-EPISODE_KINDS.indexOf(b.kind));
 for(const d of ordered)if(typeof d.start!=='function'||typeof d.advance!=='function'||!/^[a-z0-9-]+$/.test(d.definitionId))fail('invalid definition '+d.kind);
 const set=Object.freeze({id,definitions:Object.freeze(ordered.map(d=>Object.freeze({...d})))});sets.add(set);return set;
}
export function checkEpisodeSet(set:unknown):EpisodeDefinitionSet {
 if(!set||typeof set!=='object'||!sets.has(set))fail('use defineEpisodeSet');return set as EpisodeDefinitionSet;
}

/** A record id is `${year}-${index in history}` (engine entry()); find it without scanning the history. */
function recordById(s:Readonly<CivilizationState>,id:string):RecordEntry|undefined {
 const m=/^(\d+)-(\d+)$/.exec(id);if(!m)return undefined;
 const r=s.history[Number(m[2])];return r?.id===id?r:s.history.find(x=>x.id===id);
}
/** A copy of a JSON-plain value (null, boolean, finite number, string, arrays and plain objects); anything else throws. */
function plain(v:unknown,depth=0):EpisodeStateValue {
 if(depth>16)fail('episode state is too deep');
 if(v===null||typeof v==='boolean'||typeof v==='string')return v;
 if(typeof v==='number'){if(!Number.isFinite(v))fail('episode state must be JSON-plain');return v;}
 if(Array.isArray(v))return Object.freeze(v.map(x=>plain(x,depth+1)));
 if(typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)
  return Object.freeze(Object.fromEntries(Object.entries(v as object).map(([k,x])=>[k,plain(x,depth+1)])));
 return fail('episode state must be JSON-plain');
}
function deepFreeze<T>(v:T):T{if(v&&typeof v==='object'){for(const x of Object.values(v as object))deepFreeze(x);Object.freeze(v);}return v;}

interface Ledger {readonly started:ReadonlyMap<string,EpisodeTransition>;readonly origins:ReadonlySet<string>}
/** Checks one transition against the history so far (both at commit and when the whole history is rebuilt). */
function checkTransition(s:Readonly<CivilizationState>,t:EpisodeTransition,active:ActiveEpisode|undefined,seen:Ledger):void {
 const at=t.episodeId+' '+t.kind+'@'+t.year;
 if(!Array.isArray(t.evidence)||t.evidence.length===0)fail('a transition needs evidence: '+at);
 for(const e of t.evidence){
  if(e.type==='record'){const r=recordById(s,e.id);if(!r)fail('unknown record '+e.id+': '+at);if(r!.year>t.year)fail('evidence from a later year '+e.id+': '+at);}
  else if(e.type==='ledger'){if(typeof e.key!=='string'||!e.key||!Number.isSafeInteger(e.year)||e.year<0)fail('invalid ledger evidence: '+at);if(e.year>t.year)fail('ledger evidence from a later year: '+at);}
  else if(e.type==='episode'){const o=seen.started.get(e.id);if(!o||e.id===t.episodeId)fail('unknown or own episode evidence '+e.id+': '+at);}
  else fail('unknown evidence type: '+at);
 }
 if(t.kind==='started'){
  if(active)fail('a '+t.episodeKind+' episode is already active: '+at);
  if(t.id!==t.episodeId+'/0'||t.episodeId!==t.episodeKind+'-'+t.year)fail('invalid episode id: '+at);
  if(seen.started.has(t.episodeId))fail('duplicate episode id: '+at);
  const origins=t.evidence.filter(e=>e.type==='record').map(e=>(e as {id:string}).id);
  if(origins.length===0)fail('an episode starts from records: '+at);
  for(const id of origins)if(seen.origins.has(t.episodeKind+':'+id))fail('origin record already started an episode '+id+': '+at);
  if(t.parentEpisodeId!==undefined){const p=seen.started.get(t.parentEpisodeId);if(!p||p.year>t.year)fail('unknown or later parent: '+at);}
  return;
 }
 if(t.parentEpisodeId!==undefined)fail('only a start has a parent: '+at);
 if(!active||active.id!==t.episodeId)fail('no active episode: '+at);
 if(t.id!==t.episodeId+'/'+active!.transitions)fail('transition out of order: '+at);
 if(active!.lastChangedYear>=t.year)fail('one transition per episode per year: '+at);
 if(t.kind==='response-started'&&active!.response==='running')fail('a response is already running: '+at);
 if((t.kind==='response-failed'||t.kind==='response-changed')&&active!.response!=='running')fail('no response is running: '+at);
 if((t.kind==='response-failed'||t.kind==='abandoned'||t.kind==='response-changed')&&!t.reason)fail('a failure, change or abandonment states its reason: '+at);
}
function applyTransition(active:ActiveEpisode|undefined,t:EpisodeTransition):ActiveEpisode|undefined {
 if(terminal(t.kind))return undefined;
 if(t.kind==='started')return Object.freeze({id:t.episodeId,kind:t.episodeKind,startedYear:t.year,
  originRecordIds:Object.freeze(t.evidence.filter(e=>e.type==='record').map(e=>(e as {id:string}).id)),
  lastChangedYear:t.year,response:'none',transitions:1,state:t.state});
 const a=active!;
 return Object.freeze({...a,lastChangedYear:t.year,transitions:a.transitions+1,state:t.state,
  response:t.kind==='response-started'||t.kind==='response-changed'?'running':t.kind==='response-failed'?'failed':a.response});
}

function emptyStore(set:EpisodeDefinitionSet,year:number):EpisodeStore {
 return {ruleId:EPISODE_FRAMEWORK_D2C_ID,definitionSet:set.id,committedThrough:year,transitions:[],active:{}};
}
/**
 * The annual commit of year s.year (called once, at the end of finishYear). Reads the confirmed facts of this year and
 * before, appends at most one transition per kind, and touches nothing but s.episodes.
 */
export function commitEpisodeYear(s:CivilizationState,setRaw:unknown):void {
 const set=checkEpisodeSet(setRaw),year=s.year;
 if(s.observation?.lastYear!==year)fail('the year is committed only after its ledgers');
 const store=s.episodes??=emptyStore(set,year-1);
 if(store.ruleId!==EPISODE_FRAMEWORK_D2C_ID||store.definitionSet!==set.id)fail('the episodes belong to another definition set');
 if(store.committedThrough!==year-1)fail('year '+year+' is committed twice or out of order (committed through '+store.committedThrough+')');
 const records:RecordEntry[]=[];for(let i=s.history.length-1;i>=0&&s.history[i]!.year===year;i--)records.push(s.history[i]!);records.reverse();
 const view:EpisodeYear=Object.freeze({year,state:s,records:Object.freeze(records),record:(id:string)=>recordById(s,id)});
 let seq=0,ledger:Ledger|undefined;
 const seen=()=>ledger??=indexOf(store.transitions);
 for(const d of set.definitions){
  const active=store.active[d.kind];let t:EpisodeTransition|undefined;
  if(active){
   const p=d.advance(view,active);if(!p)continue;
   if(p.kind===('started' as string))fail('advance cannot start an episode');
   t={id:active.id+'/'+active.transitions,episodeId:active.id,episodeKind:d.kind,year,seq,kind:p.kind,evidence:p.evidence,state:p.state,...(p.reason?{reason:p.reason}:{})};
  }else{
   const last=lastEnded(store,d.kind),p=d.start(view,last);if(!p)continue;
   const id=d.kind+'-'+year;
   t={id:id+'/0',episodeId:id,episodeKind:d.kind,year,seq,kind:'started',evidence:p.evidence,state:p.state,...(p.parentEpisodeId?{parentEpisodeId:p.parentEpisodeId}:{})};
  }
  t=deepFreeze({...t,evidence:t.evidence.map(e=>({...e})),state:plain(t.state)});
  checkTransition(s,t,active,seen());
  store.transitions.push(t);seq++;
  if(ledger){const l=ledger as {started:Map<string,EpisodeTransition>;origins:Set<string>};if(t.kind==='started'){l.started.set(t.episodeId,t);for(const id of originsOf(t))l.origins.add(t.episodeKind+':'+id);}}
  const next=applyTransition(active,t);if(next)store.active[d.kind]=next;else delete store.active[d.kind];
 }
 store.committedThrough=year;
}
const originsOf=(t:EpisodeTransition)=>t.evidence.filter(e=>e.type==='record').map(e=>(e as {id:string}).id);
function indexOf(transitions:readonly EpisodeTransition[]):Ledger {
 const started=new Map<string,EpisodeTransition>(),origins=new Set<string>();
 for(const t of transitions)if(t.kind==='started'){started.set(t.episodeId,t);for(const id of originsOf(t))origins.add(t.episodeKind+':'+id);}
 return {started,origins};
}
function lastEnded(store:EpisodeStore,kind:EpisodeKind):{id:string;year:number;status:EpisodeStatus}|null {
 for(let i=store.transitions.length-1;i>=0;i--){const t=store.transitions[i]!;if(t.episodeKind===kind&&terminal(t.kind))return Object.freeze({id:t.episodeId,year:t.year,status:t.kind as EpisodeStatus});}
 return null;
}

export interface EpisodeView {
 readonly id:string;readonly kind:EpisodeKind;readonly startedYear:number;readonly status:EpisodeStatus;
 readonly endedYear:number|null;readonly originRecordIds:readonly string[];readonly parentEpisodeId:string|null;
 readonly transitions:readonly EpisodeTransition[];
}
/**
 * The episodes as observed in `year` (transitions of that year and before only): later years never change it.
 * `year` must not pass the committed year.
 */
export function episodesAt(s:Readonly<CivilizationState>,year:number):readonly EpisodeView[] {
 const store=s.episodes;if(!store)return Object.freeze([]);
 if(!Number.isSafeInteger(year)||year<0||year>store.committedThrough)fail('episodes are observed only through the committed year');
 const views=new Map<string,{v:EpisodeView;list:EpisodeTransition[]}>();
 for(const t of store.transitions){
  if(t.year>year)break;
  if(t.kind==='started')views.set(t.episodeId,{list:[t],v:{id:t.episodeId,kind:t.episodeKind,startedYear:t.year,status:'active',endedYear:null,originRecordIds:Object.freeze(originsOf(t)),parentEpisodeId:t.parentEpisodeId??null,transitions:[]}});
  else{const e=views.get(t.episodeId)!;e.list.push(t);if(terminal(t.kind))e.v={...e.v,status:t.kind as EpisodeStatus,endedYear:t.year};}
 }
 return Object.freeze([...views.values()].map(({v,list})=>Object.freeze({...v,transitions:Object.freeze([...list])})));
}
/**
 * Rebuilds the active episodes from the transitions and checks the whole typed history: ids, order, years, evidence,
 * response states, ends, origins and parents; the kept index must equal the rebuild. Throws on the first problem.
 */
export function checkEpisodeHistory(s:Readonly<CivilizationState>):{readonly episodes:number;readonly transitions:number;readonly active:number} {
 const store=s.episodes;if(!store)return Object.freeze({episodes:0,transitions:0,active:0});
 if(store.ruleId!==EPISODE_FRAMEWORK_D2C_ID||typeof store.definitionSet!=='string')fail('unknown episode store');
 if(!Number.isSafeInteger(store.committedThrough)||store.committedThrough>s.year||store.committedThrough<s.year-1)fail('committed year differs from the state');
 if(s.pending?store.committedThrough!==s.year-1:store.committedThrough!==s.year)fail('a pending year is not committed; any other is');
 const active:Partial<Record<EpisodeKind,ActiveEpisode>>={},started=new Map<string,EpisodeTransition>(),origins=new Set<string>();
 let lastYear=-1,seq=0;
 for(const t of store.transitions){
  if(!EPISODE_KINDS.includes(t.episodeKind))fail('unknown kind');
  if(t.year>store.committedThrough)fail('a transition after the committed year');
  if(t.year<lastYear)fail('transitions out of year order');
  seq=t.year===lastYear?seq+1:0;if(t.seq!==seq)fail('transition seq out of order');lastYear=t.year;
  if(t.kind!=='started'&&!started.has(t.episodeId))fail('transition of an unknown episode');
  if(t.kind!=='started'&&terminal(t.kind)&&!active[t.episodeKind])fail('end of an inactive episode');
  checkTransition(s,t,active[t.episodeKind],{started,origins});
  if(t.kind==='started'){started.set(t.episodeId,t);for(const id of originsOf(t))origins.add(t.episodeKind+':'+id);}
  const next=applyTransition(active[t.episodeKind],t);if(next)active[t.episodeKind]=next;else delete active[t.episodeKind];
 }
 const norm=(a:Partial<Record<EpisodeKind,ActiveEpisode>>)=>JSON.stringify(EPISODE_KINDS.map(k=>a[k]??null));
 if(norm(active)!==norm(store.active))fail('the active index differs from the transitions');
 return Object.freeze({episodes:started.size,transitions:store.transitions.length,active:Object.keys(active).length});
}
