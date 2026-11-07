/** D3-B housing stage only. Civic/public-space and bridge stages remain separate. */
import {hash01} from '../engine/rng.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import {southEntrance} from '../terrain/ground-access-review.js';
import {findPlacementReview} from '../terrain/placement-search-review.js';
import {reviewNeighborEntrances,selectReviewReservations,type ReservationReviewMode,type TypedGroundOccupation} from '../terrain/facility-plan-review.js';
import {housingAt,type ResidentialBlock,type ResidentialBlockEvent} from './housing-history.js';
import {proposeHousingLifecycle,appendHousingLifecycle} from './housing-lifecycle.js';
import type {CivilizationState,RecordEntry} from './engine.js';
import {siteNames} from './society.js';
import {createGeneratedFacilityReview,advanceGeneratedFacilityReview,chooseGeneratedFacilityReview,type GeneratedFacilityReview,type GeneratedLandReviewExtension} from './generated-facility-review.js';
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
const prefixes:Readonly<Record<RecordSite,string>>={'river-bank':'river-residential-','hill-side':'hill-residential-','coast-inlet':'coast-residential-'};
// Only this synchronous, append-only review stage uses these caches. Old readers
// remain uncached and still detect callers mutating a legacy history in place.
const views=new WeakMap<object,{year:number;view:ReturnType<typeof housingAt>}>();
const readHousing:typeof housingAt=(history,year,site)=>{
 if(!history)return housingAt(history,year,site);
 let cached=views.get(history);
 // When this immutable history has no future events, advancing the observation
 // year cannot change its reduced view. Past observations still replay normally.
 const complete=cached&&(history.events.at(-1)?.year??history.introducedYear)<=cached.year;
 if(!cached||cached.year!==year&&!(complete&&year>=cached.year)){
  cached={year,view:housingAt(history,year)};views.set(history,cached);
 }
 return {status:cached.view.status,blocks:cached.view.blocks.filter(b=>!site||b.siteId===site)};
};
/** Only for immutable, privately owned histories inside a generated transaction. */
export const readOwnedGeneratedHousing=readHousing;
const failedPlots=new WeakMap<object,Set<string>>();
const lastYears=new WeakMap<object,Map<string,number>>();
function latestYears(state:CivilizationState){
 const history=state.housing!;let years=lastYears.get(history);
 if(!years){years=new Map();for(const event of history.events)years.set(event.blockId,event.year);lastYears.set(history,years);}
 return (id:string,builtYear:number)=>years!.get(id)??builtYear;
}
export interface GeneratedHousingReview {
 readonly format:'generated-housing-review';readonly status:'review-only';readonly review:GeneratedFacilityReview;
}
function tracked(state:CivilizationState,site:RecordSite){
 if(!state.housing||state.housing.legacyUntracked||state.housing.introducedYear!==0)throw Error('Generated housing requires known year-zero history');
 const view=readHousing(state.housing,state.year,site);if(view.status!=='known')throw Error('Unknown generated housing occupancy');return view;
}
function additionalOccupancy(_review:GeneratedFacilityReview,state:CivilizationState,site:RecordSite):readonly TypedGroundOccupation[]{
 return tracked(state,site).blocks.map(b=>({id:b.blockId,kind:'housing',plot:b.footprint,entrance:southEntrance(b.footprint)}));
}
function record(state:CivilizationState,kind:string,id:string,title:string,relatedIds:readonly string[]=[]):RecordEntry {
 return {id:state.year+'-'+state.history.length,year:state.year,tag:'地域',kind,buildingId:id,title,
  body:'確定した敷地と、それまでの住宅履歴を保ったまま暮らしが変わった。',causes:['地域の住宅の必要性と維持条件'],important:true,...(relatedIds.length?{relatedIds:[...relatedIds]}:{})};
}
function nextId(state:CivilizationState,site:RecordSite):{id:string;ordinal:number}{
 let last=0;for(const e of state.housing!.events)if(e.kind==='built'&&e.after.siteId===site){
  const suffix=e.blockId.startsWith(prefixes[site])?e.blockId.slice(prefixes[site].length):'';
  if(!/^\d{5,}$/.test(suffix)||!Number.isSafeInteger(Number(suffix))||Number(suffix)<1)throw Error('Unknown generated residential ID');last=Math.max(last,Number(suffix));
 }
 if(!Number.isSafeInteger(last+1))throw Error('Residential ID space exhausted');return {id:prefixes[site]+String(last+1).padStart(5,'0'),ordinal:last+1};
}
export function createGeneratedHousingExtension(extra?:GeneratedLandReviewExtension['additionalOccupancy']):GeneratedLandReviewExtension {
 return {additionalOccupancy:(r,s,site)=>[...additionalOccupancy(r,s,site),...(extra?.(r,s,site)??[])],afterFacilities(review,state){
 const holds=review.diagnostics.holds as Record<string,number>;
 // All same-year ordinary facilities are already committed before housing.
 for(let i=0;i<sites.length;i++){
  const site=sites[i]!,population=state.observation!.people[i]??0;tracked(state,site);
  if(state.year===0||state.year%60!==0||population<900)continue;
  const {id,ordinal}=nextId(state,site),plan=review.plans[site];
  const occupied:TypedGroundOccupation[]=[...review.placements.filter(p=>p.site===site&&p.builtYear<=state.year).map(p=>({id:p.objectId,kind:p.kind,plot:p.plot,entrance:p.entrance})),...additionalOccupancy(review,state,site),...(extra?.(review,state,site)??[])];
  const reservations=selectReviewReservations(plan,review.reservationMode,new Set(occupied.map(p=>p.id))),neighborEntrances=reviewNeighborEntrances('housing',occupied);
  const key=JSON.stringify([site,id,plan.primaryRoot,plan.nucleus,occupied,reservations,neighborEntrances]);
  let failed=failedPlots.get(review.terrain);if(!failed){failed=new Set();failedPlots.set(review.terrain,failed);}
  const result=failed.has(key)?{status:'hold' as const,reason:'no-safe-plot'}:findPlacementReview({terrain:review.terrain,site,year:state.year,confirmedYear:state.year,historyStatus:'known',primaryRoot:plan.primaryRoot,occupancy:occupied,reservations},
   {objectId:id,purpose:'housing',width:18,depth:8,nucleus:plan.nucleus,neighborEntrances});
  if(result.status==='hold'&&result.reason==='no-safe-plot')failed.add(key);
  if(result.status==='hold'){const key=site+':housing:'+result.reason;holds[key]=(holds[key]??0)+1;continue;}
  const block:ResidentialBlock={blockId:id,siteId:site,footprint:result.plot,builtYear:state.year,
   housingCount:2+Math.floor(hash01(state.seed,state.year,1)*3),condition:'sound',use:'occupied',
   styleId:result.plot.y<120?'low':result.plot.y<145?'courtyard':'terraced',styleSeed:(state.seed+state.year+ordinal-1)>>>0};
  const cause=record(state,'housing-built',id,siteNames[i]+'に住宅街区が築かれる');
  const seq=state.housing!.events.filter(e=>e.year===state.year).reduce((n,e)=>Math.max(n,e.seq+1),0);
  const event:ResidentialBlockEvent={year:state.year,seq,kind:'built',blockId:id,after:block,causeRecordId:cause.id};
  const next={...state.housing!,events:[...state.housing!.events,event]};readHousing(next,state.year);state.history.push(cause);state.housing=next;
 }
 // Existing lifecycle rules already accept all three districts. They preserve
 // immutable footprints/styles and skip a block built earlier in this same year.
 const yearRecords:RecordEntry[]=[];
 for(let n=state.history.length-1;n>=0&&state.history[n]!.year===state.year;n--)yearRecords.push(state.history[n]!);
 for(let i=0;i<sites.length;i++){
  const site=sites[i]!,district=state.economy?.districts[i];tracked(state,site);
  const hazard=yearRecords.find(r=>r.kind==='earthquake'||site==='river-bank'&&(r.kind==='fire'||r.kind==='flood')||site==='coast-inlet'&&r.kind==='storm');
  const life=proposeHousingLifecycle({readHousing,lastEventYear:latestYears(state),history:state.housing!,year:state.year,siteId:site,population:state.observation!.people[i]??0,
   coverage:district?.coverage.at(-1)??0,shortageYears:district?.shortageYears??0,hazard:hazard?.kind?{id:hazard.id,kind:hazard.kind}:undefined});
  if(!life)continue;
  const titles={underused:'住宅街区の利用が減る',vacated:'住宅街区が空き家になる',damaged:'住宅街区が損傷する',ruined:'住宅街区が廃墟となる',
   repaired:'住宅街区が修繕される',reused:'住宅街区が再利用される',expanded:'住宅街区が増築される',built:'住宅街区が建設される'};
  const cause=record(state,'housing-'+life.kind,life.blockId,siteNames[i]+'で'+titles[life.kind],life.causeRecordId?[life.causeRecordId]:[]);
  const next=appendHousingLifecycle(state.housing!,state.year,life,cause.id,readHousing);state.history.push(cause);state.housing=next;
 }
 }};
}
export const generatedHousingExtension=createGeneratedHousingExtension();
export function createGeneratedHousingReview(terrain:ValidatedTerrainRecord,mode:ReservationReviewMode):GeneratedHousingReview|{status:'hold';reason:string}{
 const review=createGeneratedFacilityReview(terrain,mode);return review.status==='hold'?review:{format:'generated-housing-review',status:'review-only',review};
}
function check(input:GeneratedHousingReview){if(input.format!=='generated-housing-review'||input.status!=='review-only')throw Error('Invalid generated housing boundary');}
export function advanceGeneratedHousingReview(input:GeneratedHousingReview,years:number,choices:'stop'|'automatic'='stop'):GeneratedHousingReview {
 check(input);return {...input,review:advanceGeneratedFacilityReview(input.review,years,choices,generatedHousingExtension)};
}
export function chooseGeneratedHousingReview(input:GeneratedHousingReview,index:number):GeneratedHousingReview {
 check(input);return {...input,review:chooseGeneratedFacilityReview(input.review,index,'manual',generatedHousingExtension)};
}
