/** Shared C1/C2 formula; reads an explicitly supplied confirmed prefix only. */
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import type {IrrigationSourceIndex} from './sources-v1.js';
import type {ChannelEvent,ChannelState,ChannelSystem} from './review-types-v1.js';
import type {PatchState} from '../environment/model-v1.js';
import {irrigationWettedCells,patchIndex} from './ecology-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {waterBuffers,moistureAt} from '../environment/model-v1.js';
import {irrigationEconomyRule as rule,type EconomyEffect} from './economy-types-v1.js';
export function economyGainBp(wet:number,field:number,moisture:number|null,fields:number):number {if(!Number.isSafeInteger(wet)||!Number.isSafeInteger(field)||wet<0||field<wet||!Number.isSafeInteger(fields)||fields<0||moisture!==null&&!Number.isFinite(moisture))throw Error('Invalid harvest inputs');return field>0&&moisture!==null?Math.floor(rule.gainMaxBp*(wet/field)*Math.max(0,Math.min(1,-moisture/rule.dryScale))/Math.max(1,fields)):0;}
export function economyWorkBp(length:number,kind:'built'|'maintained'|'repaired'|'backfilled'|'routine'):number {if(!Number.isSafeInteger(length)||length<1||length>64||!['built','maintained','repaired','backfilled','routine'].includes(kind))throw Error('Invalid work inputs');return Math.ceil(rule[`${kind}Bp`]*length/rule.lengthScale);}
export function economyCostBp(work:readonly {kind:'built'|'maintained'|'repaired'|'backfilled';length:number}[],routineLength:number|null){const requestedCostBp=work.reduce((n,w)=>n+economyWorkBp(w.length,w.kind),routineLength===null?0:economyWorkBp(routineLength,'routine'));return {requestedCostBp,costBp:Math.min(rule.costMaxBp,requestedCostBp)};}

export interface EconomyPrefixAccess {
 channelAt(year:number):ChannelState|null;
 system(id:string):ChannelSystem|undefined;
 eventsAt(year:number):readonly ChannelEvent[];
 environmentAt(year:number):{humidity:number;patchAt(index:number):PatchState|null};
}
export function economyEffectCalculator(review:GeneratedFacilityReview,source:Pick<IrrigationSourceIndex,'at'|'keyAt'>,access:EconomyPrefixAccess,introducedYear:number){
 const r=readOwnedRecordPhysics(review.terrain.sites['river-bank'].physics),buffer=waterBuffers(review,'river-bank'),wetCache=new Map<string,Uint8Array>();
 return (year:number):EconomyEffect=>{
  const sourceYear=year-1,channel=access.channelAt(sourceYear),status=channel?.status??'none',system=channel?access.system(channel.id):undefined,work=access.eventsAt(sourceYear).filter(e=>e.year>introducedYear&&['built','maintained','repaired','backfilled'].includes(e.kind));
  const {requestedCostBp,costBp}=economyCostBp(work.map(e=>({kind:e.kind as 'built'|'maintained'|'repaired'|'backfilled',length:access.system(e.systemId)!.geometry.path.length})),system&&(status==='active'||status==='idle')?system.geometry.path.length:null);let wetCells=0,fieldCells=0,moisture:number|null=null,fieldCount=0;
  if(status==='active'&&system){const frame=source.at(sourceYear);fieldCount=frame.fields.length;if(frame.fields.some(f=>f.id===system.geometry.field.id)){
   const key=system.id+'/'+source.keyAt(sourceYear);let wet=wetCache.get(key);if(!wet){wet=irrigationWettedCells(system,frame);wetCache.set(key,wet);}const state=access.environmentAt(sourceYear),p=system.geometry.field.plot;let total=0,known=true;const patches=new Map<number,PatchState|null>();
   for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){const i=y*320+x;if(r.surface[i]!==1||r.bearing[i]!==0)continue;fieldCells++;wetCells+=wet[i]!;const index=patchIndex(x,y);if(!patches.has(index))patches.set(index,state.patchAt(index));const patch=patches.get(index);if(!patch)known=false;else total+=moistureAt(state.humidity,buffer[index]!,patch[2]);}if(known&&fieldCells)moisture=total/fieldCells;
  }}
  return {sourceYear,systemId:system?.id??null,status,wetCells,fieldCells,moisture,fieldCount,gainBp:economyGainBp(wetCells,fieldCells,moisture,fieldCount),requestedCostBp,costBp,workEventIds:work.map(e=>e.id)};
 };
}
