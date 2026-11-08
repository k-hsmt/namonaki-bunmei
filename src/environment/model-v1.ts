/** Versioned integer ecology. No civilization RNG, scene clock or world generation. */
import {vegetationSites,vegetationPatchPlot,vegetationOverlap,vegetationStage,type VegetationHistory,type VegetationStage} from '../vegetation/history-v1.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {lastObservedYear} from '../story/engine.js';
export type CoupledVegetation=Omit<VegetationHistory,'schemaVersion'|'ruleId'>&{readonly schemaVersion:2;readonly ruleId:'patch-environment-v2'};
/** Growth in quarter-years, consecutive stress, soil debt, use/recovery clock. */
export type PatchState=readonly [number,number,number,number];
export interface EnvironmentState {readonly year:number;readonly humidity:number;readonly temperature:number;readonly patches:Readonly<Record<RecordSite,readonly (PatchState|null)[]>>}
export interface ClimateTarget {readonly year:number;readonly humidity:number;readonly temperature:number}
export interface LandUseEvent {readonly id:string;readonly year:number;readonly site:RecordSite;readonly objectId:string;readonly sourceRecordId:string;readonly plot:GroundPlot;readonly active:boolean;readonly farm:boolean}
export interface EnvironmentHistory {readonly schemaVersion:1;readonly ruleId:'environment-coupled-v1'|'environment-coupled-v2';readonly climateStart?:number;readonly introducedYear:0;readonly confirmedThrough:number;readonly seed:number;readonly targets:readonly ClimateTarget[];readonly uses:readonly LandUseEvent[];readonly checkpoints:readonly EnvironmentState[];readonly current:EnvironmentState}
export interface EnvironmentView {readonly humidity:number;readonly temperature:number;readonly moisture:readonly (number|null)[];readonly soil:readonly (number|null)[]}
export const environmentLimits=Object.freeze({interval:100,soilMax:40,dryYears:40,growthMax:600});
export function landUseEvents(r:GeneratedFacilityReview):readonly LandUseEvent[]{
 const end=lastObservedYear(r.state),events:LandUseEvent[]=[];
 const add=(id:string,year:number,site:RecordSite,objectId:string,sourceRecordId:string,plot:GroundPlot,active:boolean,farm=false)=>{if(year<=end)events.push({id,year,site,objectId,sourceRecordId,plot:{...plot},active,farm});};
 for(const p of r.placements)add('foundation/'+p.objectId,p.builtYear,p.site,p.objectId,p.sourceRecordId,p.plot,true,p.kind==='field');
 for(const b of r.bridgeReview?.bridges??[])for(const [i,p] of b.geometry.bankSupports.entries())add('bridge/'+b.geometry.bridgeId+'/'+i,b.builtYear,'river-bank',b.geometry.bridgeId+'/'+i,b.sourceRecordId,p,true);
 for(const e of r.state.housing?.events??[])if(e.kind==='built')add('housing/'+e.blockId,e.year,e.after.siteId,e.blockId,e.causeRecordId!,e.after.footprint,true);
 for(const e of r.state.publicSpaces?.events??[])add('space/'+e.spaceId+'/'+e.seq,e.year,e.after.siteId,e.spaceId,e.causeRecordId,e.after.footprint,e.after.condition==='used');
 for(const [i,site] of vegetationSites.entries()){
  const previous=new Map<string,boolean>();
  for(const [n,c] of (r.state.observation?.sites?.[i]?.buildingChanges??[]).entries()){
   const p=r.placements.find(p=>p.objectId===c.building.id&&p.kind==='field');if(!p)continue;const active=c.building.condition!=='ruined',before=previous.get(p.objectId);previous.set(p.objectId,active);
   if(before!==undefined&&active!==before)add('field/'+p.objectId+'/'+n,c.year,site,p.objectId,c.building.recordId!,p.plot,active,true);
  }
 }
 // Stable sorting preserves each source ledger's sequence within the same year.
 return events.sort((a,b)=>a.year-b.year);
}
const contexts=new WeakMap<object,Map<RecordSite,readonly number[]>>();
export function waterBuffers(r:GeneratedFacilityReview,site:RecordSite):readonly number[]{
 let sites=contexts.get(r.terrain);if(!sites){sites=new Map();contexts.set(r.terrain,sites);}const cached=sites.get(site);if(cached)return cached;
 const raster=readOwnedRecordPhysics(r.terrain.sites[site].physics),d=new Int32Array(57600);d.fill(57600);const queue=new Int32Array(57600);let head=0,tail=0;
 for(let i=96*320;i<57600;i++)if(raster.surface[i]===2){d[i]=0;queue[tail++]=i;}
 while(head<tail){const i=queue[head++]!,x=i%320,y=Math.floor(i/320);for(const j of [x>0?i-1:-1,x<319?i+1:-1,y>96?i-320:-1,y<179?i+320:-1])if(j>=0&&d[j]!>d[i]!+1){d[j]=d[i]!+1;queue[tail++]=j;}}
 const result=Object.freeze(Array.from({length:440},(_,index)=>{const p=vegetationPatchPlot(index);let nearest=57600;for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+8;x++){const i=y*320+x;if(raster.surface[i]===1&&raster.bearing[i]===0)nearest=Math.min(nearest,d[i]!);}return Math.max(0,24-Math.floor(nearest/2));}));sites.set(site,result);return result;
}
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
export function moistureAt(humidity:number,buffer:number,soil:number){return clamp(humidity+buffer-soil,-100,100);}
export function stepPatch(p:PatchState,humidity:number,temperature:number,buffer:number,speed:1|2,maximum:2|4,occupied:boolean,farm:boolean,changedFarm:boolean):PatchState {
 let [units,stress,soil,clock]=p;if(changedFarm)clock=0;
 if(farm){if(++clock>=5){soil=Math.min(40,soil+1);clock=0;}}else if(!occupied){if(++clock>=10){soil=Math.max(0,soil-1);clock=0;}}else clock=0;
 if(occupied)return [units,0,soil,clock];
 const m=moistureAt(humidity,buffer,soil),dry=m< -35;stress=dry?stress+1:0;
 if(stress>=40){const stage=vegetationStage(units/4,maximum);units=Math.min(units,[0,0,32,112,300][stage]!);stress=0;}
 let rate=m>15?4:m>=-15?2:m>=-35?1:0;rate=Math.floor(rate/speed/(temperature< -25?2:1));
 return [Math.min(600,units+rate),stress,soil,clock];
}
export function initialEnvironment(v:CoupledVegetation):EnvironmentState{return {year:0,humidity:0,temperature:0,patches:Object.fromEntries(vegetationSites.map(site=>[site,v.initial[site].map(p=>p?[Math.min(600,p[0]*4),0,0,0]:null)])) as unknown as EnvironmentState['patches']};}
function covered(plot:GroundPlot){const indices:number[]=[];for(let row=Math.floor((plot.y-96)/8);row<=Math.floor((plot.y+plot.depth-97)/8);row++)for(let col=Math.floor(plot.x/8);col<=Math.floor((plot.x+plot.width-1)/8);col++){const i=row*40+col;if(i>=0&&i<440&&vegetationOverlap(vegetationPatchPlot(i),plot))indices.push(i);}return indices;}
/** Trial-only extension. The D2 entry point never supplies these effects. */
export interface IrrigationPatchEffects {readonly moisture:readonly number[];readonly occupiedPatches:readonly number[];readonly disturbedPatches:readonly number[]}
export function environmentRunner(v:CoupledVegetation,r:GeneratedFacilityReview,uses:readonly LandUseEvent[],from:EnvironmentState){return runEnvironment(v,r,uses,from);}
export function irrigationEnvironmentRunner(v:CoupledVegetation,r:GeneratedFacilityReview,uses:readonly LandUseEvent[],from:EnvironmentState,effectsAt:(year:number)=>IrrigationPatchEffects){return runEnvironment(v,r,uses,from,effectsAt);}
function runEnvironment(v:CoupledVegetation,r:GeneratedFacilityReview,uses:readonly LandUseEvent[],from:EnvironmentState,effectsAt?:(year:number)=>IrrigationPatchEffects){
 const patches=Object.fromEntries(vegetationSites.map(site=>[site,from.patches[site].map(p=>p?[...p]:null)])) as Record<RecordSite,(number[]|null)[]>,occupied=Object.fromEntries(vegetationSites.map(s=>[s,new Int16Array(440)])) as Record<RecordSite,Int16Array>,farms=Object.fromEntries(vegetationSites.map(s=>[s,new Int16Array(440)])) as Record<RecordSite,Int16Array>;
 const active=new Map<string,LandUseEvent>(),useYears=new Map<number,{e:LandUseEvent;indices:number[]}[]>(),disturbances=new Map<number,{site:RecordSite;indices:number[]}[]>();
 const apply=(e:LandUseEvent,indices:readonly number[])=>{const before=active.get(e.site+'/'+e.objectId);if(before?.active)for(const i of indices){occupied[e.site][i]!--;if(before.farm)farms[e.site][i]!--;}active.set(e.site+'/'+e.objectId,e);if(e.active)for(const i of indices){occupied[e.site][i]!++;if(e.farm)farms[e.site][i]!++;}};
 for(const e of uses){const indices=covered(e.plot);if(e.year<=from.year)apply(e,indices);else{const a=useYears.get(e.year)??[];a.push({e,indices});useYears.set(e.year,a);}}
 for(const e of v.events){if(e.year<from.year||e.year===from.year&&from.year!==0)continue;const a=disturbances.get(e.year)??[];a.push({site:e.site,indices:covered(e.plot)});disturbances.set(e.year,a);}
 if(from.year===0)for(const {site,indices}of disturbances.get(0)??[])for(const i of indices){const p=patches[site][i];if(p){p[0]=0;p[1]=0;}}
 const buffers=Object.fromEntries(vegetationSites.map(site=>[site,waterBuffers(r,site)])) as Record<RecordSite,readonly number[]>;let year=from.year,humidity=from.humidity,temperature=from.temperature;
 return {snapshot():EnvironmentState{return {year,humidity,temperature,patches:Object.fromEntries(vegetationSites.map(site=>[site,patches[site].map(p=>p?[...p] as unknown as PatchState:null)])) as unknown as EnvironmentState['patches']};},step(target:ClimateTarget,slow=false){
  year++;if(!slow||year%2===0){humidity+=Math.sign(target.humidity-humidity);temperature+=Math.sign(target.temperature-temperature);}
  const changes=useYears.get(year),before=changes?Object.fromEntries(vegetationSites.map(s=>[s,farms[s].slice()])) as Record<RecordSite,Int16Array>:null;
  for(const {e,indices}of changes??[])apply(e,indices);
  for(const {site,indices}of disturbances.get(year)??[])for(const i of indices){const p=patches[site][i];if(p){p[0]=0;p[1]=0;}}
  const extra=effectsAt?.(year),channel=extra?new Set(extra.occupiedPatches):null;
  for(const i of extra?.disturbedPatches??[]){const p=patches['river-bank'][i];if(p){p[0]=0;p[1]=0;}}
  for(const site of vegetationSites)for(let i=0;i<440;i++){const p=patches[site][i],initial=v.initial[site][i];if(p&&initial)patches[site][i]=stepPatch(p as unknown as PatchState,humidity,temperature,buffers[site][i]!+(site==='river-bank'?(extra?.moisture[i]??0):0),initial[1],initial[2],occupied[site][i]!>0||site==='river-bank'&&Boolean(channel?.has(i)),farms[site][i]!>0,before!==null&&Boolean(before[site][i])!==Boolean(farms[site][i])) as unknown as number[];}
 }};
}
