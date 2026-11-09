import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
/** Read-only, prefix-scoped source views shared by writer and replay. */
import {restoreGeneratedWorld,type GeneratedWorldSave} from '../story/world-save.js';
import {irrigationFrameAt} from './context-v1.js';
import {freezeReview} from './wire-v1.js';
import type {IrrigationGeometry,IrrigationContext} from './types-v1.js';
import {validateIrrigationGeometry} from './geometry-v1.js';
import type {AnnualLandDelta} from '../environment/annual-land-sources-internal.js';
import {lastObservedYear} from '../story/engine.js';
export function irrigationSources(base:GeneratedWorldSave){
 return irrigationSourcesFromWorld(freezeReview(restoreGeneratedWorld(base)));
}
export function irrigationSourcesFromWorld(world:GeneratedBridgeReview){
 const r=world.review;if(!world.environment||world.vegetation?.schemaVersion!==2)throw Error('Irrigation requires recorded D2 ecology');
 const changed=new Map<number,Set<string>>();const add=(year:number,id:string|undefined)=>{if(!id)throw Error('Missing land-use source');const list=changed.get(year)??new Set<string>();list.add(id);changed.set(year,list);};
 for(const p of r.placements)if(p.site==='river-bank')add(p.builtYear,p.sourceRecordId);
 for(const c of r.state.observation?.sites?.[0]?.buildingChanges??[])add(c.year,c.building.recordId??(c.year===0?r.placements.find(p=>p.objectId===c.building.id&&p.builtYear===0)?.sourceRecordId:undefined));
 for(const e of r.state.housing?.events??[])if(e.after.siteId==='river-bank')add(e.year,e.causeRecordId);
 for(const e of r.state.publicSpaces?.events??[])if(e.after.siteId==='river-bank')add(e.year,e.causeRecordId);
 const years=[...new Set([0,...changed.keys()])].sort((a,b)=>a-b),frames=new Map<number,ReturnType<typeof irrigationFrameAt>>();
 const keyAt=(year:number)=>{let lo=0,hi=years.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(years[mid]!<=year)lo=mid;else hi=mid;}return years[lo]!;};
 const at=(year:number)=>{const key=keyAt(year);let frame=frames.get(key);if(!frame){frame=irrigationFrameAt(world,key);frames.set(key,frame);}return {...frame,ground:{...frame.ground,year}};};
 const causes=new Map<number,typeof r.state.history>();for(const e of r.state.history)if(e.kind==='irrigation'&&e.year<=world.environment.confirmedThrough){const list=causes.get(e.year)??[];causes.set(e.year,[...list,e]);}
 return {world,environment:world.environment,vegetation:world.vegetation,at,keyAt,causes,changed:(year:number)=>[...(changed.get(year)??[])].sort()};
}
export type IrrigationSources=ReturnType<typeof irrigationSources>;
export type IrrigationSourceIndex=Pick<IrrigationSources,'at'|'keyAt'|'causes'|'changed'>;
/** Private annual writer index. Append confirmed deltas; never cache a future frame. */
export function incrementalIrrigationSources(world:GeneratedBridgeReview){
 const changes=new Map<number,Set<string>>(),causes:IrrigationSources['causes']=new Map(),years=[0],known=new Set([0]),frames=new Map<number,ReturnType<typeof irrigationFrameAt>>();let through=-1;
 const keyAt=(year:number)=>{let lo=0,hi=years.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(years[mid]!<=year)lo=mid;else hi=mid;}return years[lo]!;};
 const source:IrrigationSourceIndex={causes,keyAt,
  at(year){if(!Number.isSafeInteger(year)||year<0||year>through)throw Error('Unconfirmed annual irrigation source');const key=keyAt(year);let frame=frames.get(key);if(!frame){frame=irrigationFrameAt(world,key);frames.set(key,frame);}return {...frame,ground:{...frame.ground,year,confirmedYear:lastObservedYear(world.review.state)}};},
  changed:year=>[...(changes.get(year)??[])].sort()};
 return {source,append(delta:AnnualLandDelta){
  if(through>=0&&delta.through!==through+1||delta.through!==lastObservedYear(world.review.state))throw Error('Invalid irrigation source delta');
  for(const c of delta.riverChanges){const list=changes.get(c.year)??new Set<string>();list.add(c.id);changes.set(c.year,list);if(!known.has(c.year)){known.add(c.year);let i=years.length;while(i>0&&years[i-1]!>c.year)i--;years.splice(i,0,c.year);}}
  for(const c of delta.causes){const list=causes.get(c.year)??[];list.push(c);causes.set(c.year,list);}through=delta.through;
 }};
}
/** Probe a saved foundation against today's occupation; the altered header is never persisted. */
export function channelFitness(geometry:IrrigationGeometry,frame:Omit<IrrigationContext,'cause'>):{clear:true}|{clear:false;objectId:string|null} {
 const conflict=[...frame.ground.occupancy,...frame.ground.reservations].filter(o=>o.id!==geometry.field.id&&geometry.cells.some(([x,y])=>x>=o.plot.x&&x<o.plot.x+o.plot.width&&y>=o.plot.y&&y<o.plot.y+o.plot.depth)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)[0];
 if(conflict)return {clear:false,objectId:conflict.id};
 const cause={recordId:'irrigation-fitness-probe',year:frame.ground.year};
 try{validateIrrigationGeometry({...geometry,year:cause.year,causeRecordId:cause.recordId},{...frame,fields:[geometry.field],cause});return {clear:true};}catch{return {clear:false,objectId:null};}
}
