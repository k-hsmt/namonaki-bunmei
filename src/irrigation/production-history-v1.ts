/** Production reader and deterministic replay. No writer, proposal search or climate generator. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {lastObservedYear} from '../story/engine.js';
import {wireObject,sameWire} from '../story/generated-state-review.js';
import {initialEnvironment,environmentRunner,irrigationEnvironmentRunner,type EnvironmentHistory,type EnvironmentState,type IrrigationPatchEffects,type CoupledVegetation,landUseEvents} from '../environment/model-v1.js';
import {environmentProjection} from '../environment/history-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import {irrigationSourcesFromWorld,type IrrigationSources} from './sources-v1.js';
import {channelLifecycle,type NewChannelDecision} from './lifecycle-v1.js';
import {channelStateAt} from './replay-v1.js';
import {irrigationEffects,channelPatches} from './ecology-v1.js';
import {validateIrrigationGeometry} from './geometry-v1.js';
import {freezeReview} from './wire-v1.js';
import {checkAttempt} from './history-v1.js';
import {kernelGeometry,productionGeometry,type ProductionIrrigation,type ChannelView} from './production-types-v1.js';
const owned=new WeakSet<object>(),sources=new WeakMap<object,IrrigationSources>(),past=new WeakMap<object,Map<number,EnvironmentState>>();
export const climateRule=(e:EnvironmentHistory)=>e.ruleId==='environment-irrigated-v1'?e.climateRule!:e.ruleId;
export function ownProductionWorld(world:GeneratedBridgeReview):GeneratedBridgeReview {freezeReview(world);owned.add(world);return world;}
function sourceAt(world:GeneratedBridgeReview){let source=sources.get(world);if(!source){source=irrigationSourcesFromWorld(world);sources.set(world,source);}return source;}
const plainState=(s:EnvironmentState):EnvironmentState=>{const {channel:_,...state}=s;return state;};
const emptyEffects=():IrrigationPatchEffects=>({moisture:Array(440).fill(0),occupiedPatches:[],disturbedPatches:[]});
/** Generator lets cold-load verification yield between years without weakening replay. */
export function* replayProduction(world:GeneratedBridgeReview,decide:NewChannelDecision,previous?:{irrigation:ProductionIrrigation;environment:EnvironmentHistory}):Generator<void,{irrigation:ProductionIrrigation;environment:EnvironmentHistory}> {
 const input=world.irrigation!,e=world.environment!,v=world.vegetation as CoupledVegetation,source=irrigationSourcesFromWorld(world),start=previous?.environment.current;
 const lifecycle=channelLifecycle(source,{systems:(previous?.irrigation.systems??[]).map(s=>({...s,geometry:kernelGeometry(s.geometry)})),events:previous?.irrigation.events??[],attempts:previous?.irrigation.attempts??[],channel:start?.channel??null},[],decide);
 const checkpoints=previous?[...previous.environment.checkpoints]:[];let state:EnvironmentState;
 if(start)state=plainState(start);
 else {const prefix=environmentRunner(v,world.review,e.uses,initialEnvironment(v));state=prefix.snapshot();checkpoints.push({...state,channel:null});for(let y=1;y<=input.introducedYear;y++){prefix.step(e.targets[Math.floor(y/100)]!,climateRule(e)==='environment-coupled-v2'&&y>=e.climateStart!);if(y%100===0||y===input.introducedYear){state=prefix.snapshot();checkpoints.push({...state,channel:null});}yield;}}
 let effects=emptyEffects(),cached=effects,key='';const runner=irrigationEnvironmentRunner(v,world.review,e.uses,state,()=>effects);
 for(let year=state.year+1;year<=e.confirmedThrough;year++){
  const next=lifecycle.step(year),nextKey=[next.channel?.id,next.channel?.status,next.channel?.status==='active'?source.keyAt(year):0].join('/');
  if(key!==nextKey){cached=irrigationEffects(next.system,next.channel,next.channel?.status==='active'?next.frame:undefined);key=nextKey;}
  effects={...cached,disturbedPatches:[...new Set(next.events.filter(ev=>ev.kind==='built'||ev.kind==='backfilled').flatMap(ev=>channelPatches(lifecycle.systems.find(s=>s.id===ev.systemId)!)))].sort((a,b)=>a-b)};
  runner.step(e.targets[Math.floor(year/100)]!,climateRule(e)==='environment-coupled-v2'&&year>=e.climateStart!);
  if((year-input.introducedYear)%100===0)checkpoints.push({...runner.snapshot(),channel:next.channel});yield;
 }
 const current={...runner.snapshot(),channel:lifecycle.channel};
 return {irrigation:{...input,confirmedThrough:e.confirmedThrough,systems:lifecycle.systems.map(s=>({...s,geometry:productionGeometry(s.geometry)})),events:lifecycle.events,attempts:lifecycle.attempts},environment:{...e,checkpoints,current}};
}
function* verification(world:GeneratedBridgeReview):Generator<void,GeneratedBridgeReview> {
 const end=lastObservedYear(world.review.state),i=wireObject(world.irrigation,['schemaVersion','ruleId','introducedYear','confirmedThrough','preIntroductionRendererId','systems','events','attempts']),e=wireObject(world.environment,['schemaVersion','ruleId','climateRule','introducedYear','confirmedThrough','seed','targets','uses','checkpoints','current'],['climateStart']);
 if(i.schemaVersion!==1||i.ruleId!=='irrigation-production-v1'||!Number.isSafeInteger(i.introducedYear)||Number(i.introducedYear)<0||Number(i.introducedYear)>end||i.confirmedThrough!==end||end>10000||!['generated-scene-v3','generated-scene-v4','generated-scene-v5'].includes(i.preIntroductionRendererId as string)||world.review.growthPattern!=='organic-v3')throw Error('Invalid production irrigation boundary');
 if(e.schemaVersion!==2||e.ruleId!=='environment-irrigated-v1'||!['environment-coupled-v1','environment-coupled-v2'].includes(e.climateRule as string)||e.introducedYear!==0||e.confirmedThrough!==end||e.seed!==world.review.state.seed||world.vegetation?.schemaVersion!==2||world.vegetation.confirmedThrough!==end)throw Error('Invalid integrated environment');
 if(e.climateRule==='environment-coupled-v2'?(!Number.isSafeInteger(e.climateStart)||Number(e.climateStart)<0||Number(e.climateStart)%100||Number(e.climateStart)>(Math.floor(end/100)+1)*100):e.climateStart!==undefined)throw Error('Invalid integrated climate boundary');
 for(const key of ['systems','events','attempts'] as const)if(!Array.isArray(i[key])||i[key].length>100000)throw Error('Production ledger bounds');
 if(!Array.isArray(e.targets)||e.targets.length!==Math.floor(end/100)+1||!Array.isArray(e.checkpoints)||e.checkpoints.length>203)throw Error('Production checkpoint bounds');
 for(const [n,t]of e.targets.entries()){const x=wireObject(t,['year','humidity','temperature']);if(x.year!==n*100||!Number.isSafeInteger(x.humidity)||Math.abs(Number(x.humidity))>60||!Number.isSafeInteger(x.temperature)||Math.abs(Number(x.temperature))>40)throw Error('Invalid integrated climate target');}
 if(!sameWire(e.uses,landUseEvents(world.review)))throw Error('Integrated land use differs');
 const systems=world.irrigation!.systems,ids=new Set<string>();for(const s of systems){wireObject(s,['id','geometry']);if(typeof s.id!=='string'||ids.has(s.id))throw Error('Duplicate production system');ids.add(s.id);const g=wireObject(s.geometry,['schemaVersion','ruleId','waterContract','site','source','year','causeRecordId','field','intake','path','cells']);if(g.ruleId!=='irrigation-geometry-v1')throw Error('Unknown production geometry');}
 const receipts=new Map(world.irrigation!.attempts.map(a=>{checkAttempt(a);return [a.recordId,a] as const;}));if(receipts.size!==world.irrigation!.attempts.length)throw Error('Duplicate production receipt');
 const replay=yield* replayProduction(world,ctx=>{const a=receipts.get(ctx.cause.recordId);if(!a||a.year!==ctx.ground.year||!a.metrics)throw Error('Missing production decision');if(a.outcome==='built'){const s=systems.find(s=>s.id===a.systemId);if(!s||a.reason!==null||a.metrics.candidates<1||a.metrics.accessChecks<1||a.metrics.fields<1)throw Error('Invalid production construction');return {status:'proposed',geometry:validateIrrigationGeometry(kernelGeometry(s.geometry),ctx),metrics:a.metrics,diagnostics:a.diagnostics};}if(a.outcome!=='hold'||a.systemId!==null||!a.reason||a.reason==='awaiting-backfill')throw Error('Invalid production hold');return {status:'hold',reason:a.reason,metrics:a.metrics,diagnostics:a.diagnostics};});
 if(!sameWire(replay.irrigation,world.irrigation)||!sameWire(replay.environment,world.environment))throw Error('Production history differs from replay');
 return ownProductionWorld(world);
}
export function validateProductionWorld(world:GeneratedBridgeReview):GeneratedBridgeReview {if(owned.has(world))return world;const task=verification(world);for(;;){const r=task.next();if(r.done)return r.value;}}
export async function validateProductionWorldAsync(world:GeneratedBridgeReview):Promise<GeneratedBridgeReview>{if(owned.has(world))return world;const task=verification(world);let mark=performance.now();for(;;){const r=task.next();if(r.done)return r.value;if(performance.now()-mark>=8){await new Promise(resolve=>setTimeout(resolve,0));mark=performance.now();}}}
export function productionChannelAt(world:GeneratedBridgeReview,year:number,site:RecordSite='river-bank'):ChannelView {
 const i=world.irrigation!;if(!Number.isSafeInteger(year)||year<0||year>i.confirmedThrough)throw Error('Unconfirmed production observation');
 const introduced=year>i.introducedYear,channel=site==='river-bank'&&introduced?channelStateAt(i.events,year):null,geometry=channel&&channel.status!=='retired'?i.systems.find(s=>s.id===channel.id)!.geometry:null;
 return {introduced,channel,geometry,key:JSON.stringify([introduced,site,channel?.id,channel?.status,geometry?.year])};
}
function stateAt(world:GeneratedBridgeReview,year:number):EnvironmentState {
 const e=world.environment!,cache=past.get(world)??new Map<number,EnvironmentState>();past.set(world,cache);if(year===e.confirmedThrough)return e.current;const old=cache.get(year);if(old)return old;
 let lo=0,hi=e.checkpoints.length;while(lo+1<hi){const m=(lo+hi)>>1;if(e.checkpoints[m]!.year<=year)lo=m;else hi=m;}const checkpoint=e.checkpoints[lo]!;if(checkpoint.year===year)return checkpoint;
 let effectKey='',cachedEffects=emptyEffects();const source=sourceAt(world),i=world.irrigation!,systems=i.systems.map(s=>({...s,geometry:kernelGeometry(s.geometry)})),effectsAt=(y:number)=>{const c=channelStateAt(i.events,y),s=systems.find(s=>s.id===c?.id),key=[c?.id,c?.status,c?.status==='active'?source.keyAt(y):0].join('/');if(key!==effectKey){cachedEffects=irrigationEffects(s,c,c?.status==='active'?source.at(y):undefined);effectKey=key;}return {...cachedEffects,disturbedPatches:[...new Set(i.events.filter(ev=>ev.year===y&&(ev.kind==='built'||ev.kind==='backfilled')).flatMap(ev=>channelPatches(systems.find(s=>s.id===ev.systemId)!)))].sort((a,b)=>a-b)};};
 const runner=irrigationEnvironmentRunner(world.vegetation as CoupledVegetation,world.review,e.uses,plainState(checkpoint),effectsAt);for(let y=checkpoint.year+1;y<=year;y++)runner.step(e.targets[Math.floor(y/100)]!,climateRule(e)==='environment-coupled-v2'&&y>=e.climateStart!);
 const state=freezeReview(runner.snapshot());if(cache.size>=16)cache.delete(cache.keys().next().value!);cache.set(year,state);return state;
}
export function projectProductionEnvironment(world:GeneratedBridgeReview,year:number,site:RecordSite){
 validateProductionWorld(world);const view=productionChannelAt(world,year,site),state=stateAt(world,year),source=sourceAt(world),system=view.geometry?{id:view.channel!.id,geometry:kernelGeometry(view.geometry)}:undefined,effects=irrigationEffects(system,view.channel,view.channel?.status==='active'?source.at(year):undefined);
 return environmentProjection(world.environment!,world.vegetation as CoupledVegetation,world.review,year,site,{state,moisture:effects.moisture,disturbances:world.irrigation!.events.filter(e=>e.year<=year&&(e.kind==='built'||e.kind==='backfilled')).flatMap(e=>world.irrigation!.systems.find(s=>s.id===e.systemId)!.geometry.cells.map(point=>({year:e.year,point})))});
}
