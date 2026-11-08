import type {ChannelEvent} from './review-types-v1.js';
/** Independent single-year modifiers. No civilization writer, random choices or new routes. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {productionChannelAt,productionEnvironmentStateAt} from './production-history-v1.js';
import {irrigationSourcesFromWorld} from './sources-v1.js';
import {irrigationWettedCells,patchIndex} from './ecology-v1.js';
import {kernelGeometry} from './production-types-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {waterBuffers,moistureAt} from '../environment/model-v1.js';
import {irrigationEconomyRule as rule,type EconomyEffect} from './economy-types-v1.js';
export function economyGainBp(wet:number,field:number,moisture:number|null,fields:number):number {if(!Number.isSafeInteger(wet)||!Number.isSafeInteger(field)||wet<0||field<wet||!Number.isSafeInteger(fields)||fields<0||moisture!==null&&!Number.isFinite(moisture))throw Error('Invalid harvest inputs');return field>0&&moisture!==null?Math.floor(rule.gainMaxBp*(wet/field)*Math.max(0,Math.min(1,-moisture/rule.dryScale))/Math.max(1,fields)):0;}
export function economyWorkBp(length:number,kind:'built'|'maintained'|'repaired'|'backfilled'|'routine'):number {if(!Number.isSafeInteger(length)||length<1||length>64||!['built','maintained','repaired','backfilled','routine'].includes(kind))throw Error('Invalid work inputs');return Math.ceil(rule[`${kind}Bp`]*length/rule.lengthScale);}
export function economyCostBp(work:readonly {kind:'built'|'maintained'|'repaired'|'backfilled';length:number}[],routineLength:number|null){const requestedCostBp=work.reduce((n,w)=>n+economyWorkBp(w.length,w.kind),routineLength===null?0:economyWorkBp(routineLength,'routine'));return {requestedCostBp,costBp:Math.min(rule.costMaxBp,requestedCostBp)};}
export function economyEffectReader(world:GeneratedBridgeReview,introducedYear:number){
 const source=irrigationSourcesFromWorld(world),r=readOwnedRecordPhysics(world.review.terrain.sites['river-bank'].physics),buffer=waterBuffers(world.review,'river-bank'),systems=new Map(world.irrigation!.systems.map(s=>[s.id,s])),events=new Map<number,ChannelEvent[]>();
 for(const e of world.irrigation!.events){const list=events.get(e.year)??[];events.set(e.year,[...list,e]);}
 const wetCache=new Map<string,Uint8Array>();
 return (year:number):EconomyEffect=>{
  const sourceYear=year-1;if(year<=introducedYear||year>world.environment!.confirmedThrough)throw Error('Unconfirmed economy effect');const view=productionChannelAt(world,sourceYear),status=view.channel?.status??'none',system=view.channel?systems.get(view.channel.id):undefined,work=(events.get(sourceYear)??[]).filter(e=>e.year>introducedYear&&['built','maintained','repaired','backfilled'].includes(e.kind));
  const {requestedCostBp,costBp}=economyCostBp(work.map(e=>({kind:e.kind as 'built'|'maintained'|'repaired'|'backfilled',length:systems.get(e.systemId)!.geometry.path.length})),system&&(status==='active'||status==='idle')?system.geometry.path.length:null);let wetCells=0,fieldCells=0,moisture:number|null=null,fieldCount=0;
  if(status==='active'&&system){const frame=source.at(sourceYear);fieldCount=frame.fields.length;if(frame.fields.some(f=>f.id===system.geometry.field.id)){
   const key=system.id+'/'+source.keyAt(sourceYear);let wet=wetCache.get(key);if(!wet){wet=irrigationWettedCells({id:system.id,geometry:kernelGeometry(system.geometry)},frame);wetCache.set(key,wet);}const state=productionEnvironmentStateAt(world,sourceYear),p=system.geometry.field.plot;let total=0,known=true;
   for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){const i=y*320+x;if(r.surface[i]!==1||r.bearing[i]!==0)continue;fieldCells++;wetCells+=wet[i]!;const index=patchIndex(x,y),patch=state.patches['river-bank'][index];if(!patch)known=false;else total+=moistureAt(state.humidity,buffer[index]!,patch[2]);}if(known&&fieldCells)moisture=total/fieldCells;
  }}
  return {sourceYear,systemId:system?.id??null,status,wetCells,fieldCells,moisture,fieldCount,gainBp:economyGainBp(wetCells,fieldCells,moisture,fieldCount),requestedCostBp,costBp,workEventIds:work.map(e=>e.id)};
 };
}
