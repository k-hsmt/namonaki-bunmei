/** D2-B: review-only v5 envelope, with the existing v4 engine kept inside. No storage writes. */
import {prepareHousingSave,validateHousingSave,type HousingSaveState} from './housing-save.js';
import {step,choose,chooseAutomatically,lastObservedYear} from './engine.js';
import {CURRENT_SAVE_KEY,LEGACY_SAVE_KEYS} from './housing-persistence.js';
export const LEGACY_DRAFT_SAVE_KEY='namonaki-story-v5';
export const legacyDraftMaxBytes=16*1024*1024;
export interface LegacyFixedTerrain {
 readonly schemaVersion:1;readonly mode:'legacy-fixed';
 readonly rendererId:'legacy-d2f7cb1';readonly groundRule:'legacy-ground-d2f7cb1';
}
export interface LegacySaveDraft {
 readonly format:'namonaki-legacy-save-draft';readonly version:5;readonly schemaVersion:1;readonly status:'review-only';
 readonly initialTerrain:LegacyFixedTerrain;readonly progressionPolicy:'legacy-v4-d2f7cb1';
 readonly origin:{readonly saveVersion:2|3|4;readonly confirmedYear:number};
 readonly state:Readonly<HousingSaveState>;
}
declare const validatedLegacyDraft:unique symbol;
export type ValidatedLegacySaveDraft=LegacySaveDraft&{readonly [validatedLegacyDraft]:true};
export class LegacyDraftError extends Error {
 constructor(public readonly code:string,detail:string,options?:ErrorOptions){super(code+': '+detail,options);this.name='LegacyDraftError';}
}
function fail(code:string,detail:string):never{throw new LegacyDraftError(code,detail);}
const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
function exact(x:unknown,keys:readonly string[],where:string):Record<string,unknown>{
 if(!isObject(x)||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))return fail('FIELDS',where);return x;
}
const integer=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const fixedTerrain=():LegacyFixedTerrain=>({schemaVersion:1,mode:'legacy-fixed',rendererId:'legacy-d2f7cb1',groundRule:'legacy-ground-d2f7cb1'});
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function checkStateHeader(raw:unknown,versions:readonly number[]):asserts raw is Record<string,unknown>{
 if(!isObject(raw)||!versions.includes(raw.version as number)||typeof raw.version!=='number')fail('STATE_VERSION','numeric v2/v3/v4 required');
 if(!integer(raw.seed,0,0xffffffff)||!integer(raw.rngState,0,0xffffffff)||!integer(raw.year))fail('STATE_HEADER','seed/rng/year');
 for(const key of ['initialTerrain','terrain','placementPolicy','progressionPolicy','format'])if(Object.hasOwn(raw,key))fail('MIXED_STATE',key);
 for(const key of ['population','food','cohesion','knowledge','exchange','culture','drought','epidemic'])if(typeof raw[key]!=='number'||!Number.isFinite(raw[key]))fail('STATE_HEADER',key);
 for(const key of ['name','homeland','trait'])if(typeof raw[key]!=='string')fail('STATE_HEADER',key);
 if(!isObject(raw.lastKind)||Object.values(raw.lastKind).some(y=>!integer(y)||y>(raw.year as number)))fail('STATE_HEADER','lastKind');
 if(!Array.isArray(raw.history)||!Array.isArray(raw.samples)||!Array.isArray(raw.decisions))fail('STATE_HEADER','history/samples/decisions');
 for(const e of raw.history){
  if(!isObject(e)||!integer(e.year)||e.year>(raw.year as number)||!Array.isArray(e.causes)||e.causes.some(c=>typeof c!=='string'))fail('HISTORY','invalid entry');
  for(const key of ['id','tag','title','body'])if(typeof e[key]!=='string')fail('HISTORY',key);
 }
 for(const s of raw.samples)if(!isObject(s)||!integer(s.year)||s.year>(raw.year as number)||!integer(s.population))fail('HISTORY','invalid sample');
 for(const d of raw.decisions)if(!isObject(d)||!integer(d.year)||d.year>(raw.year as number)||typeof d.label!=='string')fail('HISTORY','invalid recorded choice');
 if(raw.pending!==null){
  const p=raw.pending;
  if(!isObject(p)||p.year!==raw.year||!Array.isArray(p.options)||p.options.length<1||p.options.length>32)fail('PENDING','invalid decision');
  for(const key of ['id','question','context'])if(typeof p[key]!=='string')fail('PENDING',key);
  for(const option of p.options){
   if(!isObject(option)||!isObject(option.impacts))fail('PENDING','invalid option');
   for(const key of ['label','description','consequence'])if(typeof option[key]!=='string')fail('PENDING',key);
   for(const [key,value] of Object.entries(option.impacts))if(!['population','food','cohesion','knowledge','exchange','culture'].includes(key)||typeof value!=='number'||!Number.isFinite(value))fail('PENDING','invalid impact');
  }
 }
 if(raw.version!==4&&Object.hasOwn(raw,'housing'))fail('MIXED_STATE','housing cannot be discarded by old-version migration');
 if(raw.version===2&&Object.hasOwn(raw,'observation'))fail('MIXED_STATE','v2 observation would be overwritten');
}
function checkedV4(raw:unknown):HousingSaveState {
 checkStateHeader(raw,[4]);
 try{return validateHousingSave(raw);}catch(cause){throw new LegacyDraftError('STATE_INVALID','existing v4 validator rejected payload',{cause});}
}
function makeDraft(state:HousingSaveState,saveVersion:2|3|4,confirmedYear:number):ValidatedLegacySaveDraft {
 return validateLegacySaveDraft({format:'namonaki-legacy-save-draft',version:5,schemaVersion:1,status:'review-only',
  initialTerrain:fixedTerrain(),progressionPolicy:'legacy-v4-d2f7cb1',origin:{saveVersion,confirmedYear},state});
}
export function migrateLegacySave(raw:unknown):ValidatedLegacySaveDraft {
 checkStateHeader(raw,[2,3,4]);const version=raw.version as 2|3|4;
 let state:HousingSaveState;
 try{state=prepareHousingSave(raw);}catch(cause){throw new LegacyDraftError('STATE_INVALID','existing migration rejected payload',{cause});}
 return makeDraft(state,version,lastObservedYear(state));
}
export function validateLegacySaveDraft(raw:unknown):ValidatedLegacySaveDraft {
 const d=exact(raw,['format','version','schemaVersion','status','initialTerrain','progressionPolicy','origin','state'],'draft');
 if(d.format!=='namonaki-legacy-save-draft'||d.version!==5||d.schemaVersion!==1||d.status!=='review-only'||d.progressionPolicy!=='legacy-v4-d2f7cb1')fail('DRAFT_CONTRACT','unknown format/version/policy/status');
 const t=exact(d.initialTerrain,['schemaVersion','mode','rendererId','groundRule'],'initialTerrain');
 for(const [key,value] of Object.entries(fixedTerrain()))if(t[key]!==value)fail('TERRAIN_MODE',key);
 const o=exact(d.origin,['saveVersion','confirmedYear'],'origin');
 if(![2,3,4].includes(o.saveVersion as number)||!integer(o.confirmedYear))fail('ORIGIN','invalid origin');
 const state=checkedV4(d.state);
 if(o.confirmedYear>lastObservedYear(state))fail('ORIGIN','confirmed year is in the future');
 if(o.saveVersion!==4&&(!state.housing.legacyUntracked||state.housing.introducedYear!==o.confirmedYear+1))fail('ORIGIN','unrecorded housing boundary changed');
 if(o.saveVersion===2&&state.observation?.legacy?.year!==o.confirmedYear)fail('ORIGIN','v2 legacy boundary changed');
 const detached:LegacySaveDraft={format:'namonaki-legacy-save-draft',version:5,schemaVersion:1,status:'review-only',initialTerrain:fixedTerrain(),progressionPolicy:'legacy-v4-d2f7cb1',
  origin:{saveVersion:o.saveVersion as 2|3|4,confirmedYear:o.confirmedYear},state};
 if(new TextEncoder().encode(JSON.stringify(detached)).length>legacyDraftMaxBytes)fail('SIZE_LIMIT','draft exceeds 16MiB');
 return freeze(detached) as ValidatedLegacySaveDraft;
}
/** Select by JSON contents, never by key name or truthiness. Unknown v5 stops. */
export function parseLegacyCompatibleSave(json:string):ValidatedLegacySaveDraft {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>legacyDraftMaxBytes)fail('SIZE_LIMIT','input exceeds 16MiB');
 let raw:unknown;try{raw=JSON.parse(json);}catch(cause){throw new LegacyDraftError('JSON','malformed JSON',{cause});}
 if(isObject(raw)&&(raw.version===5||Object.hasOwn(raw,'format')))return validateLegacySaveDraft(raw);
 return migrateLegacySave(raw);
}
export function serializeLegacySaveDraft(draft:LegacySaveDraft):string{return JSON.stringify(validateLegacySaveDraft(draft));}
/** Read-only candidate discovery. The first present value is authoritative, including ''. */
export function findLegacyDraftSave(read:(key:string)=>string|null):{key:string;draft:ValidatedLegacySaveDraft}|null {
 for(const key of [LEGACY_DRAFT_SAVE_KEY,CURRENT_SAVE_KEY,...LEGACY_SAVE_KEYS]){
  const raw=read(key);if(raw!==null)return {key,draft:parseLegacyCompatibleSave(raw)};
 }return null;
}
/** All progression is on a detached v4 payload. Existing input remains frozen and untouched. */
export function advanceLegacySaveDraft(draft:LegacySaveDraft,years:number,choices:'stop'|'automatic'='stop'):ValidatedLegacySaveDraft {
 if(!integer(years,0,10000)||!['stop','automatic'].includes(choices))fail('ADVANCE_ARGUMENT','invalid years or choice policy');
 const valid=validateLegacySaveDraft(draft),state=checkedV4(valid.state);
 for(let i=0;i<years;i++){
  if(state.pending){if(choices==='stop')break;chooseAutomatically(state);}
  step(state);if(state.pending&&choices==='automatic')chooseAutomatically(state);
 }
 return makeDraft(state,valid.origin.saveVersion,valid.origin.confirmedYear);
}
export function chooseLegacySaveDraft(draft:LegacySaveDraft,index:number,source:'manual'|'auto'='manual'):ValidatedLegacySaveDraft {
 const valid=validateLegacySaveDraft(draft),state=checkedV4(valid.state);
 if(!state.pending||!integer(index,0,state.pending.options.length-1)||!['manual','auto'].includes(source))fail('CHOICE_ARGUMENT','no valid pending choice');
 choose(state,index,source);return makeDraft(state,valid.origin.saveVersion,valid.origin.confirmedYear);
}
