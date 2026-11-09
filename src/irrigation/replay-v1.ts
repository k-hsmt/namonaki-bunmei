/** Replay recorded decisions and D2 climate. This module never proposes a new route. */
import type {GeneratedWorldSave} from '../story/world-save.js';
import {environmentStateAt} from '../environment/history-v1.js';
import {irrigationEnvironmentRunner,type EnvironmentState,type IrrigationPatchEffects} from '../environment/model-v1.js';
import {irrigationSources,type IrrigationSources} from './sources-v1.js';
import {channelLifecycle,type NewChannelDecision} from './lifecycle-v1.js';
import {channelPatches,irrigationEffects} from './ecology-v1.js';
import type {ChannelEvent,ChannelState,ChannelSystem,IrrigationControl,IrrigationCheckpoint,IrrigationReview} from './review-types-v1.js';
export function initialIrrigationState(source:IrrigationSources,year:number):IrrigationCheckpoint {return {year,channel:null,environment:environmentStateAt(source.environment,source.vegetation,source.world.review,year)};}
export function replayIrrigation(base:GeneratedWorldSave,introducedYear:number,controls:readonly IrrigationControl[],decide:NewChannelDecision,previous?:IrrigationReview){
 const source=irrigationSources(base),start=previous?.current??initialIrrigationState(source,introducedYear),checkpoints=previous?[...previous.checkpoints]:[start],lifecycle=channelLifecycle(source,{systems:previous?.systems??[],events:previous?.events??[],attempts:previous?.attempts??[],channel:start.channel},controls,decide);
 let effects:IrrigationPatchEffects={moisture:Array<number>(440).fill(0),occupiedPatches:[] as readonly number[],disturbedPatches:[] as readonly number[]},cachedKey='',cached=effects;
 // Until the first construction, the trial has exactly the already-validated D2
 // ecology. Reuse that prefix; once disturbed, never substitute D2 again, even
 // after backfill, because soil and vegetation retain the earlier canal's effects.
 const baselineAt=(year:number)=>environmentStateAt(source.environment,source.vegetation,source.world.review,year);
 const createRunner=(from:EnvironmentState)=>irrigationEnvironmentRunner(source.vegetation,source.world.review,source.environment.uses,from,()=>effects);
 let runner=previous?.systems.length?createRunner(start.environment):undefined;
 let current=start;
 for(let year=start.year+1;year<=source.environment.confirmedThrough;year++){
  const next=lifecycle.step(year),key=[next.channel?.id,next.channel?.status,next.channel?.status==='active'?source.keyAt(year):0].join('/');
  if(key!==cachedKey){cached=irrigationEffects(next.system,next.channel,next.channel?.status==='active'?next.frame:undefined);cachedKey=key;}
  const disturbed=new Set(next.events.filter(e=>e.kind==='built'||e.kind==='backfilled').flatMap(e=>channelPatches(lifecycle.systems.find(s=>s.id===e.systemId)!)));
  effects={...cached,disturbedPatches:[...disturbed].sort((a,b)=>a-b)};
  if(!runner&&next.system)runner=createRunner(baselineAt(year-1));
  runner?.step(source.environment.targets[Math.floor(year/100)]!,source.environment.ruleId==='environment-coupled-v2'&&year>=source.environment.climateStart!);
  if((year-introducedYear)%100===0){current={year,channel:next.channel,environment:runner?.snapshot()??baselineAt(year)};checkpoints.push(current);}
 }
 current={year:source.environment.confirmedThrough,channel:lifecycle.channel,environment:runner?.snapshot()??baselineAt(source.environment.confirmedThrough)};
 return {systems:lifecycle.systems,events:lifecycle.events,attempts:lifecycle.attempts,checkpoints,current};
}
export function channelStateAt(events:readonly ChannelEvent[],year:number):ChannelState|null {let lo=0,hi=events.length;while(lo<hi){const m=(lo+hi)>>1;if(events[m]!.year<=year)lo=m+1;else hi=m;}return lo?events[lo-1]!.after:null;}
export function irrigationEnvironmentAt(source:IrrigationSources,trial:IrrigationReview,year:number):EnvironmentState {
 if(year<trial.introducedYear)return environmentStateAt(source.environment,source.vegetation,source.world.review,year);
 if(year===trial.confirmedThrough)return trial.current.environment;
 const checkpoint=trial.checkpoints[Math.floor((year-trial.introducedYear)/100)]!;if(year===checkpoint.year)return checkpoint.environment;
 const systems=new Map(trial.systems.map(s=>[s.id,s])),eventsByYear=new Map<number,ChannelEvent[]>();for(const event of trial.events){const list=eventsByYear.get(event.year)??[];list.push(event);eventsByYear.set(event.year,list);}
 let effectKey='',cached:IrrigationPatchEffects={moisture:Array(440).fill(0),occupiedPatches:[],disturbedPatches:[]};
 const runner=irrigationEnvironmentRunner(source.vegetation,source.world.review,source.environment.uses,checkpoint.environment,y=>{const state=channelStateAt(trial.events,y),system=state?systems.get(state.id):undefined,key=[state?.id,state?.status,state?.status==='active'?source.keyAt(y):0].join('/'),disturbed=[...new Set((eventsByYear.get(y)??[]).filter(e=>e.kind==='built'||e.kind==='backfilled').flatMap(e=>channelPatches(systems.get(e.systemId)!)))];if(key!==effectKey){cached=irrigationEffects(system,state,state?.status==='active'?source.at(y):undefined);effectKey=key;}return {...cached,disturbedPatches:disturbed};});
 for(let y=checkpoint.year+1;y<=year;y++)runner.step(source.environment.targets[Math.floor(y/100)]!,source.environment.ruleId==='environment-coupled-v2'&&y>=source.environment.climateStart!);return runner.snapshot();
}
