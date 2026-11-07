/** Saved vegetation is independent of terrain, architecture and civilization RNG. */
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {lastObservedYear} from '../story/engine.js';
import {wireObject} from '../story/generated-state-review.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
export const vegetationSites=['river-bank','hill-side','coast-inlet'] as const;
export type VegetationStage=0|1|2|3|4;
/** Initial biological age, years per growth unit, maximum attainable stage. */
export type VegetationPatch=readonly [number,1|2,2|4];
export interface VegetationEvent {readonly id:string;readonly year:number;readonly site:RecordSite;readonly kind:'clear'|'release'|'fire';readonly plot:GroundPlot;readonly sourceRecordId:string}
export interface VegetationHistory {readonly schemaVersion:1;readonly ruleId:'patch-succession-v1';readonly introducedYear:0;readonly confirmedThrough:number;readonly seed:number;readonly initial:Readonly<Record<RecordSite,readonly (VegetationPatch|null)[]>>;readonly events:readonly VegetationEvent[]}
export const vegetationLimits=Object.freeze({patchSize:8,columns:40,rows:11,patches:440,grassAge:8,shrubAge:28,youngAge:75,matureAge:150});
export function vegetationPatchPlot(i:number):GroundPlot {return {x:(i%40)*8,y:96+Math.floor(i/40)*8,width:8,depth:Math.min(8,84-Math.floor(i/40)*8)};}
export const vegetationOverlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
export function freezeVegetation<T>(o:T):T {if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freezeVegetation);Object.freeze(o);}return o;}
export function vegetationStage(age:number,maximum:2|4):VegetationStage {return Math.min(maximum,age<8?0:age<28?1:age<75?2:age<150?3:4) as VegetationStage;}
function expanded(p:GroundPlot):GroundPlot {const x=Math.max(0,p.x-24),y=Math.max(96,p.y-24);return {x,y,width:Math.min(320,p.x+p.width+24)-x,depth:Math.min(180,p.y+p.depth+24)-y};}
/** Events only describe confirmed, spatially sourced actions. No observation writes. */
export function vegetationSourceEvents(r:GeneratedFacilityReview):readonly VegetationEvent[] {
 const end=lastObservedYear(r.state),events:VegetationEvent[]=[],records=new Map(r.state.history.map(e=>[e.id,e]));
 const add=(id:string,year:number,site:RecordSite,kind:VegetationEvent['kind'],plot:GroundPlot,sourceRecordId:string)=>{
  if(year<=end){const record=records.get(sourceRecordId);if(!record||record.year!==year)throw Error('Unconfirmed vegetation source');events.push({id,year,site,kind,plot:{...plot},sourceRecordId});}
 };
 for(const p of r.placements)add('foundation/'+p.objectId,p.builtYear,p.site,'clear',p.plot,p.sourceRecordId);
 for(const b of r.bridgeReview?.bridges??[])for(const [n,p] of b.geometry.bankSupports.entries())add('bridge/'+b.geometry.bridgeId+'/'+n,b.builtYear,'river-bank','clear',p,b.sourceRecordId);
 for(const e of r.state.housing?.events??[])if(e.kind==='built')add('housing/'+e.blockId,e.year,e.after.siteId,'clear',e.after.footprint,e.causeRecordId!);
 for(const e of r.state.publicSpaces?.events??[])add('space/'+e.spaceId+'/'+e.year+'/'+e.seq,e.year,e.after.siteId,e.kind==='overgrown'?'release':'clear',e.after.footprint,e.causeRecordId);
 for(const [index,site] of vegetationSites.entries()){
  const previous=new Map<string,string>();
  for(const c of r.state.observation?.sites?.[index]?.buildingChanges??[]){
   if(c.year>end)break;const b=c.building,p=r.placements.find(p=>p.objectId===b.id),before=previous.get(b.id);previous.set(b.id,b.condition);
   if(!p||!b.recordId||!before)continue;
   if(b.kind==='field'&&b.condition!==before&&(b.condition==='ruined'||before==='ruined'))add('field/'+b.id+'/'+c.year,c.year,site,b.condition==='ruined'?'release':'clear',p.plot,b.recordId);
   const source=records.get(b.recordId),fire=source?.relatedIds?.some(id=>records.get(id)?.kind==='fire');
   if(b.condition==='damaged'&&before!=='damaged'&&fire)add('fire/'+b.id+'/'+c.year,c.year,site,'fire',expanded(p.plot),b.recordId);
  }
 }
 events.sort((a,b)=>a.year-b.year||(a.site<b.site?-1:a.site>b.site?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));return events;
}
const owned=new WeakMap<object,object>();
/** Wire validation never imports the initial vegetation producer or re-rolls it. */
export function validateVegetationHistory(raw:unknown,r:GeneratedFacilityReview):VegetationHistory {
 const v=wireObject(raw,['schemaVersion','ruleId','introducedYear','confirmedThrough','seed','initial','events']);
 if(v.schemaVersion!==1||v.ruleId!=='patch-succession-v1'||v.introducedYear!==0||v.seed!==r.state.seed||v.confirmedThrough!==lastObservedYear(r.state))throw Error('Unknown or unconfirmed vegetation history');
 if(owned.get(raw as object)!==r.terrain){
  const initial=wireObject(v.initial,vegetationSites);
  for(const site of vegetationSites){
   const patches=initial[site];if(!Array.isArray(patches)||patches.length!==440)throw Error('Invalid vegetation patches');
   const raster=readOwnedRecordPhysics(r.terrain.sites[site].physics);
   for(const [i,p] of patches.entries()){
    if(p===null)continue;if(!Array.isArray(p)||p.length!==3||!Number.isSafeInteger(p[0])||p[0]<0||p[0]>300||![1,2].includes(p[1])||![2,4].includes(p[2]))throw Error('Invalid initial vegetation');
    const plot=vegetationPatchPlot(i);let land=false;for(let y=plot.y;y<plot.y+plot.depth;y++)for(let x=plot.x;x<plot.x+8;x++){const j=y*320+x;land ||=raster.surface[j]===1&&raster.bearing[j]===0;}
    if(!land)throw Error('Vegetation initialized on water or rock');
   }
  }
 }
 const expected=vegetationSourceEvents(r);if(!Array.isArray(v.events)||JSON.stringify(v.events)!==JSON.stringify(expected))throw Error('Vegetation disturbance differs from confirmed land/history');
 const result=owned.get(raw as object)===r.terrain?raw as VegetationHistory:freezeVegetation(structuredClone(raw) as VegetationHistory);owned.set(result,r.terrain);return result;
}
export function syncVegetationHistory(v:VegetationHistory,r:GeneratedFacilityReview):VegetationHistory {
 const result=freezeVegetation({...v,confirmedThrough:lastObservedYear(r.state),events:vegetationSourceEvents(r)});if(owned.get(v)===r.terrain)owned.set(result,r.terrain);return result;
}
export interface VegetationPatchView {readonly index:number;readonly plot:GroundPlot;readonly age:number;readonly stage:VegetationStage;readonly disturbedYear:number|null}
/** Pure analytic reconstruction: cost depends on patch/events, not the world's age. */
export function vegetationAt(v:VegetationHistory,year:number,site:RecordSite):readonly VegetationPatchView[] {
 if(v.schemaVersion!==1||v.ruleId!=='patch-succession-v1'||v.introducedYear!==0||!Number.isSafeInteger(year)||year<v.introducedYear||year>v.confirmedThrough||!vegetationSites.includes(site))throw Error('Unconfirmed vegetation observation');
 const result:VegetationPatchView[]=[];
 for(const [i,initial] of v.initial[site].entries()){
  if(!initial)continue;const p=vegetationPatchPlot(i);let from=0,age=initial[0],last:number|null=null,fires:number[]=[];
  for(const e of v.events){if(e.year>year)break;if(e.site!==site||!vegetationOverlap(e.plot,p))continue;from=e.year;age=0;last=e.year;if(e.kind==='fire')fires.push(e.year);}
  const grown=age+Math.floor((year-from)/initial[1]),recent=fires.filter(y=>year-y<120),max=recent.length>=2?2:initial[2];
  result.push({index:i,plot:p,age:grown,stage:vegetationStage(grown,max),disturbedYear:last});
 }
 return result;
}
