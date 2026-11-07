/** D3-B civic stage. No public-space/bridge or live save activation. */
import {hash01} from '../engine/rng.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import {reviewNeighborEntrances,reviewFacilityAnchor,selectReviewReservations} from '../terrain/facility-plan-review.js';
import type {ReservationReviewMode,TypedGroundOccupation} from '../terrain/facility-plan-review.js';
import {findPlacementReview} from '../terrain/placement-search-review.js';
import {southEntrance} from '../terrain/ground-access-review.js';
import {siteAt} from './settlement-history.js';
import {validateCivicBuilding,validateCivicLedger,type CivicBuilding} from './civic-architecture.js';
import {housingAt} from './housing-history.js';
import {regions} from './population.js';
import {tradeYearsFor} from './regional-economy.js';
import {siteNames} from './society.js';
import {generatedHousingExtension,createGeneratedHousingReview} from './generated-housing-review.js';
import {advanceGeneratedFacilityReview,chooseGeneratedFacilityReview,type GeneratedFacilityReview,type GeneratedLandReviewExtension,type ReviewFacilityPlacement} from './generated-facility-review.js';
import {lastObservedYear,type RecordEntry} from './engine.js';
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
export function proposeGeneratedCivic(review:GeneratedFacilityReview,index:number){
 const {state}=review,year=state.year,siteId=sites[index];
 const hold=(reason:string)=>({status:'hold' as const,reason});
 if(!siteId)return hold('unsupported-terrain');
 if(year<1||year%40!==0)return hold('not-ready');
 const housing=housingAt(state.housing,year,siteId);if(housing.status!=='known')return hold('unknown-history');
 const history=state.observation?.sites,site=siteAt(history,index,year);if(!site||!history)return hold('unknown-history');
 if(site.buildings.some(b=>b.civic))return hold('already-built');
 const hall=site.buildings.find(b=>b.kind==='hall'&&!b.civic&&b.condition==='intact'&&b.builtYear<=year-24);if(!hall)return hold('no-hall');
 const now=site.practices.find(p=>p.kind==='council'&&p.active);
 const earlier=siteAt(history,index,year-24)?.practices.find(p=>p.kind==='council'&&p.active&&p.originId===now?.originId);
 const continuous=history[index]!.practiceChanges.filter(c=>c.year>year-24&&c.year<=year).every(c=>c.practices.some(p=>p.kind==='council'&&p.active&&p.originId===now?.originId));
 if(!now||!earlier||!continuous)return hold('no-council');
 const district=state.economy?.districts[index];
 if((state.observation!.people[index]??0)<4500||(district?.coverage.at(-1)??0)<.94||(district?.shortageYears??1)>0||!state.economy||tradeYearsFor(state.economy,regions[index]!.id)<3)return hold('no-capacity');
 const style=hash01(state.seed,14,0)<.5?'great-hall':'courtyard-hall',id='civic-'+siteId+'-'+year+'-'+style;
 const occupied:TypedGroundOccupation[]=[...review.placements.filter(p=>p.site===siteId&&p.builtYear<=year).map(p=>({id:p.objectId,kind:p.kind,plot:p.plot,entrance:p.entrance})),...generatedHousingExtension.additionalOccupancy(review,state,siteId)];
 const plan=review.plans[siteId],result=findPlacementReview({terrain:review.terrain,site:siteId,year,confirmedYear:year,historyStatus:'known',primaryRoot:plan.primaryRoot,occupancy:occupied,
  reservations:selectReviewReservations(plan,review.reservationMode,new Set(occupied.map(p=>p.id)))},
  {objectId:id,purpose:'civic',width:style==='great-hall'?44:56,depth:style==='great-hall'?22:30,nucleus:plan.nucleus,
   neighborEntrances:reviewNeighborEntrances('civic',occupied),housingEntrances:housing.blocks.map(b=>southEntrance(b.footprint))});
 if(result.status==='hold')return hold(result.reason);
 const recordId=year+'-'+state.history.length,[x,y]=reviewFacilityAnchor('civic',result.plot);
 const candidate:CivicBuilding={id,kind:'hall',x,y,builtYear:year,condition:'intact',recordId,civic:{architectureStyle:style,footprint:result.plot,constructionRecordId:recordId}};
 if(!validateCivicBuilding(candidate,siteId))throw Error('Invalid generated civic candidate');
 const event:RecordEntry={id:recordId,year,tag:'地域',kind:'building-built',buildingId:id,important:true,
  title:siteNames[index]+'に大きな共同施設が建てられる',body:'寄り合いと維持の余力が続き、使える土地に共同の建築が築かれた。',
  causes:['24年間続いた寄り合い','維持するための食糧と交易','空いていた地表敷地'],relatedIds:[...new Set([now.recordId,earlier.recordId,hall.recordId].filter((x):x is string=>Boolean(x)))]};
 return {status:'proposed' as const,candidate,event,placement:{objectId:id,site:siteId,kind:'civic' as const,plot:result.plot,entrance:result.entrance,builtYear:year,sourceRecordId:recordId}};
}
const extension:GeneratedLandReviewExtension={additionalOccupancy:generatedHousingExtension.additionalOccupancy,afterFacilities(review,state){
 for(let index=0;index<sites.length;index++){
  const result=proposeGeneratedCivic(review,index);
  if(result.status==='hold'){
   if(state.year%40===0){const holds=review.diagnostics.holds as Record<string,number>,key=sites[index]+':civic:'+result.reason;holds[key]=(holds[key]??0)+1;}continue;
  }
  const site=state.observation!.sites![index]!;
  if((site.buildingChanges.at(-1)?.year??0)>state.year)throw Error('Past civic construction');
  state.history.push(result.event);site.view.buildings.push(result.candidate);site.buildingChanges.push({year:state.year,building:structuredClone(result.candidate)});
  (review.placements as ReviewFacilityPlacement[]).push(result.placement);
  validateCivicLedger(state.observation!.sites,state.history,state.year,'generated-review-only');
 }
 generatedHousingExtension.afterFacilities(review,state);
}};
export interface GeneratedCivicReview {readonly format:'generated-civic-review';readonly status:'review-only';readonly review:GeneratedFacilityReview}
export function createGeneratedCivicReview(terrain:ValidatedTerrainRecord,mode:ReservationReviewMode):GeneratedCivicReview|{status:'hold';reason:string}{
 const parent=createGeneratedHousingReview(terrain,mode);return parent.status==='hold'?parent:{format:'generated-civic-review',status:'review-only',review:parent.review};
}
export function advanceGeneratedCivicReview(input:GeneratedCivicReview,years:number,choices:'stop'|'automatic'='stop'):GeneratedCivicReview {
 if(input.format!=='generated-civic-review'||input.status!=='review-only')throw Error('Invalid generated civic boundary');
 const review=advanceGeneratedFacilityReview(input.review,years,choices,extension);
 validateCivicLedger(review.state.observation?.sites,review.state.history,lastObservedYear(review.state),'generated-review-only');
 return {...input,review};
}
export function chooseGeneratedCivicReview(input:GeneratedCivicReview,index:number):GeneratedCivicReview {
 if(input.format!=='generated-civic-review'||input.status!=='review-only')throw Error('Invalid generated civic boundary');
 const review=chooseGeneratedFacilityReview(input.review,index,'manual',extension);
 validateCivicLedger(review.state.observation?.sites,review.state.history,lastObservedYear(review.state),'generated-review-only');
 return {...input,review};
}
