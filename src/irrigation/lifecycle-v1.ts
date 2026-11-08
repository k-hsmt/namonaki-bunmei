/** Deterministic lifecycle. Only the injected new-system decision may search. */
import type {IrrigationContext,IrrigationProposal} from './types-v1.js';
import type {ChannelAttempt,ChannelCause,ChannelEvent,ChannelEventKind,ChannelState,ChannelStatus,ChannelSystem,IrrigationControl} from './review-types-v1.js';
import {irrigationHistoryLimits as limits} from './review-types-v1.js';
import {channelFitness,type IrrigationSources} from './sources-v1.js';
export type NewChannelDecision=(ctx:IrrigationContext)=>IrrigationProposal;
export interface LifecycleSeed {readonly systems:readonly ChannelSystem[];readonly events:readonly ChannelEvent[];readonly attempts:readonly ChannelAttempt[];readonly channel:ChannelState|null}
export function channelLifecycle(source:IrrigationSources,seed:LifecycleSeed,controls:readonly IrrigationControl[],decide:NewChannelDecision){
 const systems=[...seed.systems],events=[...seed.events],attempts=[...seed.attempts];let channel=seed.channel;const controlYears=new Map<number,IrrigationControl[]>();for(const c of controls){const list=controlYears.get(c.year)??[];list.push(c);controlYears.set(c.year,list);}
 function emit(year:number,kind:ChannelEventKind,cause:ChannelCause,status:ChannelStatus,id=channel?.id,maintained=false){
  if(!id)throw Error('Missing channel');const seq=events.length+1,eventId='waterway-event-'+seq,before=channel?.id===id?channel.status:null;
  const after:ChannelState={id,status,lastMaintainedYear:maintained?year:channel!.lastMaintainedYear,lastMaintainedEventId:maintained?eventId:channel!.lastMaintainedEventId,abandonedYear:status==='abandoned'?year:channel?.id===id?channel.abandonedYear:null,abandonedEventId:status==='abandoned'?eventId:channel?.id===id?channel.abandonedEventId:null};
  events.push({seq,id:eventId,year,systemId:id,kind,cause,before,after});channel=after;
 }
 return {systems,events,attempts,get channel(){return channel;},step(year:number){
  const firstEvent=events.length,frame=source.at(year),sources=source.changed(year),system=()=>systems.find(s=>s.id===channel?.id),healthy=()=>Boolean(system()&&frame.fields.some(f=>f.id===system()!.geometry.field.id));
  const landCause=(objectId:string|null=null):ChannelCause=>{if(!sources.length)throw Error('Missing changed-land source');return {kind:'land-use',recordIds:sources,objectId};};
  if(channel&&channel.status!=='retired'&&sources.length){const fit=channelFitness(system()!.geometry,frame);if(!fit.clear)emit(year,'backfilled',landCause(fit.objectId),'retired');}
  if(channel&&channel.status!=='retired'){
   const clock:ChannelCause={kind:'policy-clock',parentEventId:channel.lastMaintainedEventId,elapsed:year-channel.lastMaintainedYear};
   if(channel.status==='abandoned'){if(year-channel.abandonedYear!>=limits.backfillYears)emit(year,'backfilled',{kind:'policy-clock',parentEventId:channel.abandonedEventId!,elapsed:year-channel.abandonedYear!},'retired');}
   else if(year-channel.lastMaintainedYear>=limits.abandonmentYears)emit(year,'abandoned',clock,'abandoned');
   else if(year-channel.lastMaintainedYear>=limits.maintenanceYears&&channel.status!=='damaged')emit(year,'damaged',clock,'damaged');
   if(channel.status==='active'&&!healthy())emit(year,'paused',landCause(system()!.geometry.field.id),'idle');
  }
  for(const c of controlYears.get(year)??[])if(c.kind==='damage'){if(!channel||!['active','idle'].includes(channel.status))throw Error('Controlled damage requires working equipment');emit(year,'damaged',{kind:'controlled-input',inputId:c.id},'damaged');}
  const requests:{recordId:string;cause:ChannelCause}[]=[...(source.causes.get(year)??[]).map(c=>({recordId:c.id,cause:{kind:'chronicle' as const,recordId:c.id}})),...(controlYears.get(year)??[]).filter(c=>c.kind==='irrigation').map(c=>({recordId:'controlled/'+c.id,cause:{kind:'controlled-input' as const,inputId:c.id}}))];
  for(const request of requests){
   if(channel&&channel.status!=='retired'){
    if(channel.status==='abandoned'||channel.status==='damaged'&&!healthy()){attempts.push({year,...request,outcome:'hold',systemId:channel.id,reason:channel.status==='abandoned'?'awaiting-backfill':'no-active-field',metrics:null,diagnostics:[]});continue;}
    if(!channelFitness(system()!.geometry,frame).clear)throw Error('Equipment failed revalidation without a land change');
    const outcome=channel.status==='damaged'?'repaired':'maintained';emit(year,outcome,request.cause,channel.status==='idle'?'idle':'active',channel.id,true);attempts.push({year,...request,outcome,systemId:channel.id,reason:null,metrics:null,diagnostics:[]});continue;
   }
   const decision=decide({...frame,cause:{recordId:request.recordId,year}});
   if(decision.status==='hold'){attempts.push({year,...request,outcome:'hold',systemId:null,reason:decision.reason,metrics:decision.metrics,diagnostics:decision.diagnostics});continue;}
   const id='channel-'+String(systems.length+1).padStart(6,'0');systems.push({id,geometry:decision.geometry});emit(year,'built',request.cause,'active',id,true);attempts.push({year,...request,outcome:'built',systemId:id,reason:null,metrics:decision.metrics,diagnostics:decision.diagnostics});
  }
  if(channel?.status==='idle'&&healthy()){if(!channelFitness(system()!.geometry,frame).clear)throw Error('Restored field loses conveyance');emit(year,'resumed',landCause(system()!.geometry.field.id),'active');}
  if(events.length>limits.maxEntries||systems.length>limits.maxYears||attempts.length>limits.maxEntries)throw Error('Irrigation ledger exceeds bounds');
  return {channel,system:system(),events:events.slice(firstEvent),frame};
 }};
}
