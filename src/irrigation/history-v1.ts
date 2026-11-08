/** Independent review reader. Recorded decisions are replayed; no proposal writer is imported. */
import {validateWorldSave,restoreGeneratedWorld,type GeneratedWorldSave} from '../story/world-save.js';
import {wireObject,assertJsonWire,sameWire} from '../story/generated-state-review.js';
import {lastObservedYear} from '../story/engine.js';
import {vegetationSites,vegetationPatchPlot,vegetationStage,vegetationOverlap,type VegetationPatchView} from '../vegetation/history-v1.js';
import {moistureAt,waterBuffers} from '../environment/model-v1.js';
import {validateIrrigationGeometry,type IrrigationProposal} from './geometry-v1.js';
import {irrigationSources,type IrrigationSources} from './sources-v1.js';
import {replayIrrigation,channelStateAt,irrigationEnvironmentAt} from './replay-v1.js';
import {irrigationEffects} from './ecology-v1.js';
import {freezeReview,reviewBaseHash} from './wire-v1.js';
import {irrigationHistoryLimits as limits,type IrrigationReview,type IrrigationControl,type ChannelAttempt} from './review-types-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
export type * from './review-types-v1.js';
const owned=new WeakMap<object,IrrigationSources>();
const states=new WeakMap<object,Map<number,ReturnType<typeof irrigationEnvironmentAt>>>();
export function ownIrrigationReview(trial:IrrigationReview):IrrigationReview {const frozen=freezeReview(trial);owned.set(frozen,irrigationSources(frozen.base));states.set(frozen,new Map());return frozen;}
export function knownIrrigationReview(trial:IrrigationReview):IrrigationSources {const source=owned.get(trial);if(!source)throw Error('Validate the irrigation review before observation or continuation');return source;}
export function validateControls(raw:unknown,mode:'natural'|'controlled',introducedYear:number,end:number):readonly IrrigationControl[]{
 if(!Array.isArray(raw)||raw.length>limits.maxEntries||mode==='natural'&&raw.length)throw Error('Invalid irrigation controls');const ids=new Set<string>();let prior=introducedYear;
 for(const value of raw){const c=wireObject(value,['id','year','kind']);if(typeof c.id!=='string'||!c.id.length||c.id.length>80||ids.has(c.id)||!Number.isSafeInteger(c.year)||Number(c.year)<=introducedYear||Number(c.year)<prior||Number(c.year)>end||!['irrigation','damage'].includes(c.kind as string))throw Error('Invalid controlled input');ids.add(c.id);prior=Number(c.year);}
 return raw as IrrigationControl[];
}
const reasons=['unsupported-site','unknown-history','unconfirmed-year','no-active-field','no-owned-intake','no-flat-route','occupied','access-loss','too-long','search-limit','awaiting-backfill'];
export function checkAttempt(a:unknown):ChannelAttempt {
 const q=wireObject(a,['year','cause','recordId','outcome','systemId','reason','metrics','diagnostics']);
 if(!Number.isSafeInteger(q.year)||typeof q.recordId!=='string'||!['built','maintained','repaired','hold'].includes(q.outcome as string)||q.systemId!==null&&typeof q.systemId!=='string'||q.reason!==null&&!reasons.includes(q.reason as string)||!Array.isArray(q.diagnostics)||q.diagnostics.length>1000)throw Error('Invalid irrigation decision receipt');
 if(q.metrics!==null){const m=wireObject(q.metrics,['searchStates','intakes','fields','candidates','accessChecks','walkVisits','accessRejected']);if(Object.values(m).some(n=>!Number.isSafeInteger(n)||Number(n)<0||Number(n)>20000000)||Number(m.searchStates)>250000||Number(m.candidates)>128||Number(m.accessChecks)>Number(m.candidates)||Number(m.accessRejected)>Number(m.accessChecks))throw Error('Invalid search receipt bounds');}
 for(const d of q.diagnostics){const x=wireObject(d,['year','causeRecordId','fieldId','reason','candidates']);if(x.year!==q.year||x.causeRecordId!==q.recordId||x.fieldId!==null&&typeof x.fieldId!=='string'||!reasons.includes(x.reason as string)||!Number.isSafeInteger(x.candidates)||Number(x.candidates)<0||Number(x.candidates)>128)throw Error('Invalid proposal diagnostic');}
 return a as ChannelAttempt;
}
export async function validateIrrigationReview(raw:unknown):Promise<IrrigationReview>{
 if(raw&&typeof raw==='object'&&owned.has(raw))return raw as IrrigationReview;
 assertJsonWire(raw);const text=JSON.stringify(raw);if(new TextEncoder().encode(text).length>limits.maxBytes)throw Error('Irrigation review exceeds 16MiB');
 const t=wireObject(JSON.parse(text),['format','schemaVersion','ruleId','status','mode','introducedYear','confirmedThrough','base','baseHash','controls','systems','events','attempts','checkpoints','current']);
 if(t.format!=='irrigation-review-v1'||t.schemaVersion!==1||t.ruleId!=='irrigation-history-v1'||t.status!=='review-only'||!['natural','controlled'].includes(t.mode as string))throw Error('Unknown irrigation review');
 const base=validateWorldSave(t.base);if(base.version!==5||base.initialTerrain.mode!=='generated'||!('environment' in base)||!base.environment||!('vegetation' in base)||base.vegetation?.schemaVersion!==2)throw Error('Missing base environment');
 const end=base.environment.confirmedThrough;if(!Number.isSafeInteger(t.introducedYear)||Number(t.introducedYear)<0||Number(t.introducedYear)>end||t.confirmedThrough!==end||end>limits.maxYears||t.baseHash!==await reviewBaseHash(base))throw Error('Invalid irrigation boundary or base binding');
 const controls=validateControls(t.controls,t.mode as 'natural'|'controlled',Number(t.introducedYear),end);
 for(const key of ['systems','events','attempts','checkpoints'] as const)if(!Array.isArray(t[key])||t[key].length>limits.maxEntries)throw Error('Irrigation array bounds');
 const systems=t.systems as IrrigationReview['systems'],ids=new Set<string>();for(const value of systems){const s=wireObject(value,['id','geometry']);if(typeof s.id!=='string'||ids.has(s.id))throw Error('Duplicate waterway');ids.add(s.id);}
 const attempts=(t.attempts as unknown[]).map(checkAttempt),receipts=new Map(attempts.map(a=>[a.recordId,a]));if(receipts.size!==attempts.length)throw Error('Duplicate decision receipt');
 const replay=replayIrrigation(base as GeneratedWorldSave,Number(t.introducedYear),controls,ctx=>{
  const receipt=receipts.get(ctx.cause.recordId);if(!receipt||receipt.year!==ctx.ground.year||receipt.metrics===null)throw Error('Missing recorded route decision');
  if(receipt.outcome==='built'){const system=systems.find(s=>s.id===receipt.systemId);if(!system||receipt.reason!==null||receipt.metrics.candidates<1||receipt.metrics.accessChecks<1||receipt.metrics.fields<1)throw Error('Invalid new-system receipt');return {status:'proposed',geometry:validateIrrigationGeometry(system.geometry,ctx),metrics:receipt.metrics,diagnostics:receipt.diagnostics};}
  if(receipt.outcome!=='hold'||receipt.systemId!==null||!receipt.reason||receipt.reason==='awaiting-backfill')throw Error('Invalid held proposal');return {status:'hold',reason:receipt.reason,metrics:receipt.metrics,diagnostics:receipt.diagnostics} as IrrigationProposal;
 });
 for(const key of ['systems','events','attempts','checkpoints','current'] as const)if(!sameWire(replay[key],t[key]))throw Error('Irrigation '+key+' differs from recorded replay');
 return ownIrrigationReview({...t,base,controls,...replay} as unknown as IrrigationReview);
}
export function observeIrrigationReview(trial:IrrigationReview,year:number,site:RecordSite='river-bank'){
 const source=knownIrrigationReview(trial);if(!Number.isSafeInteger(year)||year<0||year>trial.confirmedThrough||!vegetationSites.includes(site))throw Error('Unconfirmed irrigation observation');
 const cache=states.get(trial)!;let state=cache.get(year);if(!state){state=freezeReview(irrigationEnvironmentAt(source,trial,year));if(cache.size>=16)cache.delete(cache.keys().next().value!);cache.set(year,state);}
 const channel=year>=trial.introducedYear?channelStateAt(trial.events,year):null,system=trial.systems.find(s=>s.id===channel?.id),effects=irrigationEffects(site==='river-bank'?system:undefined,site==='river-bank'?channel:null,site==='river-bank'&&channel?.status==='active'?source.at(year):undefined),buffer=waterBuffers(source.world.review,site),moisture:(number|null)[]=Array(440).fill(null),soil:(number|null)[]=Array(440).fill(null),vegetation:VegetationPatchView[]=[];
 for(const [index,p]of state.patches[site].entries()){if(!p)continue;const plot=vegetationPatchPlot(index);let disturbedYear:number|null=null,fires=0;
  for(const e of source.vegetation.events){if(e.year>year)break;if(e.site===site&&vegetationOverlap(e.plot,plot)){disturbedYear=e.year;if(e.kind==='fire'&&year-e.year<120)fires++;}}
  if(site==='river-bank')for(const event of trial.events){if(event.year>year)break;if(event.kind!=='built'&&event.kind!=='backfilled')continue;const g=trial.systems.find(s=>s.id===event.systemId)!.geometry;if(g.cells.some(([x,y])=>x>=plot.x&&x<plot.x+plot.width&&y>=plot.y&&y<plot.y+plot.depth))disturbedYear=Math.max(disturbedYear??-1,event.year);}
  vegetation.push({index,plot,age:p[0]/4,stage:vegetationStage(p[0]/4,fires>=2?2:source.vegetation.initial[site][index]![2]),disturbedYear});moisture[index]=moistureAt(state.humidity,buffer[index]!+(site==='river-bank'?effects.moisture[index]!:0),p[2]);soil[index]=p[2];
 }
 return freezeReview({year,site,historyStatus:year<trial.introducedYear?'not-introduced' as const:'known' as const,channel:site==='river-bank'?channel:null,geometry:site==='river-bank'&&channel?.status!=='retired'?system?.geometry??null:null,environment:{humidity:state.humidity,temperature:state.temperature,moisture,soil},vegetation});
}
