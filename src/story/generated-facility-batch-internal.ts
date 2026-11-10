import {bindTerrainReviewInternal,terrainForReviewAtInternal,type TerrainReviewProvider} from './terrain-review-binding-internal.js';
import {runGeneratedLandBatch,type LandPhaseObserver} from './generated-land-batch-internal.js';
import {assertProductionBoundary,coupledTrialBoundary,economicProductionBoundary,terrainChangeTrialBoundary,terrainProductionBoundary} from './trial-boundary.js';
import type {CoupledAnnualModifier} from './coupled-economy-policy-internal.js';
import {coupledChoiceBinding} from './coupled-choice-binding-internal.js';
import type {EconomyObserver} from './economy-observer.js';
/** D3-A independent ordinary-facility progression. Not a v5 save or live UI mode. */
import {createHousingCivilization} from './housing-persistence.js';
import {choose,chooseAutomatically,lastObservedYear,type CivilizationState,type ReviewLandProgression} from './engine.js';
import {siteAt} from './settlement-history.js';
import {readOwnedTerrainRecord,type ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import type {RecordSite,RecordPoint} from '../terrain/terrain-record-types.js';
import type {GrowthPattern} from '../terrain/organic-placement-v2.js';
import {planFacilitySitesReview,selectReviewReservations,reviewNeighborEntrances,reviewFacilityAnchor,type ReviewFacilityPlan,type ReservationReviewMode,type TypedGroundOccupation} from '../terrain/facility-plan-review.js';
import {findPlacementReview} from '../terrain/placement-search-review.js';
import {reviewGroundAccess,southEntrance,type GroundPlot,type GroundPurpose} from '../terrain/ground-access-review.js';
import {withGeneratedBridgeAccess,proposeGeneratedBridge,reviewBridgeAnchor,type BridgeHistoryReview,type SavedReviewBridge} from './generated-bridge-history-review.js';
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
export interface ReviewFacilityPlacement {
 readonly objectId:string;readonly site:RecordSite;readonly kind:GroundPurpose;
 readonly plot:GroundPlot;readonly entrance:RecordPoint;readonly builtYear:number;readonly sourceRecordId:string;
}
export interface GeneratedFacilityReview {
 readonly terrainChangeBoundary?:typeof terrainChangeTrialBoundary;
 readonly terrainPolicyBoundary?:typeof terrainProductionBoundary;
 readonly trialBoundary?:typeof coupledTrialBoundary;
 readonly economicPolicyBoundary?:typeof economicProductionBoundary;
 readonly format:'generated-facility-review';readonly status:'review-only';readonly placementPolicy:null;
 readonly terrain:ValidatedTerrainRecord;readonly plans:Readonly<Record<RecordSite,ReviewFacilityPlan>>;
 readonly reservationMode:ReservationReviewMode;readonly state:CivilizationState;
 readonly growthPattern?:GrowthPattern;
 readonly placements:readonly ReviewFacilityPlacement[];
 readonly bridgeReview?:BridgeHistoryReview;
 readonly diagnostics:{readonly holds:Readonly<Record<string,number>>;readonly fullSearches:number};
}
/** Optional generated land stages; absent in the D3-A ordinary-only census. */
export interface GeneratedLandReviewExtension {
 additionalOccupancy:(review:GeneratedFacilityReview,state:CivilizationState,site:RecordSite)=>readonly TypedGroundOccupation[];
 afterFacilities:(review:GeneratedFacilityReview,state:CivilizationState)=>void;
}
/** A UI batch may stop after its first new record while validating only once. */
export interface GeneratedAdvanceOptions {readonly stopAtNewRecord?:boolean;readonly observeEconomy?:EconomyObserver}
export function createGeneratedFacilityReview(terrain:ValidatedTerrainRecord,reservationMode:ReservationReviewMode,growthPattern?:GrowthPattern):GeneratedFacilityReview|{status:'hold';reason:string}{
 if(growthPattern!==undefined&&!['organic-v2','organic-v3'].includes(growthPattern))throw Error('Unknown growth pattern');
 const plans={} as Record<RecordSite,ReviewFacilityPlan>;
 for(const site of sites){const result=planFacilitySitesReview(terrain,site,growthPattern);if(result.status==='hold')return result;plans[site]=result;}
 // Validate mode before creating any civilization state.
 selectReviewReservations(plans['river-bank'],reservationMode);
 const state=createHousingCivilization(terrain.source.seed),placements:ReviewFacilityPlacement[]=[];
 for(let i=0;i<sites.length;i++){
  const site=sites[i]!,history=state.observation!.sites![i]!,plot=plans[site].slots[0]!.plot!,[x,y]=reviewFacilityAnchor('house',plot);
  for(const b of history.view.buildings){b.x=x;b.y=y;placements.push({objectId:b.id,site,kind:'house',plot,entrance:southEntrance(plot),builtYear:0,sourceRecordId:state.history[0]!.id});}
  for(const change of history.buildingChanges){change.building.x=x;change.building.y=y;}
 }
 return {format:'generated-facility-review',status:'review-only',placementPolicy:null,terrain,plans,reservationMode,state,placements,diagnostics:{holds:{},fullSearches:0},...(growthPattern?{growthPattern}:{})};
}
function mutableCopy(input:GeneratedFacilityReview,coupled:false|'trial'|'production'|'terrain-trial'|'terrain-production'=false):GeneratedFacilityReview {
 if(coupled==='terrain-production'){if(input.terrainPolicyBoundary!==terrainProductionBoundary||input.terrainChangeBoundary!==undefined||input.trialBoundary!==undefined||input.economicPolicyBoundary!==undefined)throw Error('Missing production terrain land boundary');}else if(coupled==='terrain-trial'){if(input.terrainChangeBoundary!==terrainChangeTrialBoundary||input.terrainPolicyBoundary!==undefined||input.trialBoundary!==undefined||input.economicPolicyBoundary!==undefined)throw Error('Missing terrain land boundary');}else if(coupled==='production'){if(input.economicPolicyBoundary!==economicProductionBoundary||input.trialBoundary!==undefined||input.terrainChangeBoundary!==undefined||input.terrainPolicyBoundary!==undefined)throw Error('Missing production economic boundary');}else if(coupled){if(input.trialBoundary!==coupledTrialBoundary||input.economicPolicyBoundary!==undefined||input.terrainChangeBoundary!==undefined||input.terrainPolicyBoundary!==undefined)throw Error('Missing coupled land boundary');}else assertProductionBoundary(input);
 if(input.format!=='generated-facility-review'||input.status!=='review-only'||input.placementPolicy!==null||input.state.version!==4||input.state.seed!==input.terrain.source.seed)throw Error('Invalid generated review boundary');
 if(input.growthPattern!==undefined&&!['organic-v2','organic-v3'].includes(input.growthPattern))throw Error('Unknown growth pattern');
 const terrain=readOwnedTerrainRecord(input.terrain),next=structuredClone({...input,terrain:null});return {...next,terrain};
}
function policyFor(review:GeneratedFacilityReview,extension?:GeneratedLandReviewExtension,observeEconomy?:EconomyObserver):ReviewLandProgression {
 if(observeEconomy!==undefined&&typeof observeEconomy!=='function')throw Error('Invalid economy observer');
 const placements=review.placements as ReviewFacilityPlacement[],holds=review.diagnostics.holds as Record<string,number>;
 const pending=new Map<string,{site:RecordSite;kind:GroundPurpose;plot:GroundPlot;entrance:RecordPoint}>();
 const pendingBridges:SavedReviewBridge['geometry'][]=[];
 const hold=(site:RecordSite,kind:string,reason:string)=>{const key=site+':'+kind+':'+reason;holds[key]=(holds[key]??0)+1;return {status:'hold' as const};};
 return {mode:'generated-review-only',...(observeEconomy?{observeEconomy}:{}),placeFacility(state,siteIndex,candidate){
  const site=sites[siteIndex];if(!site)throw Error('Invalid generated site');
  if(candidate.kind==='bridge'&&(!review.bridgeReview||site!=='river-bank'))return hold(site,candidate.kind,'unsupported-bridge');
  const plan=review.plans[site],actual:TypedGroundOccupation[]=[...placements.filter(p=>p.site===site&&p.builtYear<=state.year).map(p=>({id:p.objectId,kind:p.kind,plot:p.plot,entrance:p.entrance})),...(extension?.additionalOccupancy(review,state,site)??[])];
  const context=withGeneratedBridgeAccess(review,{terrain:terrainForReviewAtInternal(review,state.year,site),site,year:state.year,confirmedYear:state.year,historyStatus:'known' as const,primaryRoot:plan.primaryRoot,occupancy:actual,
   reservations:selectReviewReservations(plan,review.reservationMode,new Set(actual.map(p=>p.id)))});
  if(candidate.kind==='bridge'){
   const result=proposeGeneratedBridge(review,context,candidate.id);if(result.status==='hold')return hold(site,candidate.kind,result.reason);
   pendingBridges.push(result.geometry);const [x,y]=reviewBridgeAnchor(result.geometry);return {status:'clear',x,y};
  }
  const preferred=plan.slots.find(s=>s.id===candidate.id)?.plot;
  let plot:GroundPlot,entrance:RecordPoint;
  const checked=preferred&&!review.growthPattern?reviewGroundAccess(context,candidate.kind,candidate.id,preferred):null;
  if(preferred&&checked?.status==='clear'){plot=preferred;entrance=checked.entrance;}
  else {
   (review.diagnostics as {fullSearches:number}).fullSearches++;
   const result=findPlacementReview(context,{objectId:candidate.id,purpose:candidate.kind,width:candidate.kind==='field'?26:18,depth:candidate.kind==='field'?14:7,
    nucleus:plan.nucleus,neighborEntrances:reviewNeighborEntrances(candidate.kind,actual),...(review.growthPattern?{growthPattern:review.growthPattern}:{})});
   if(result.status==='hold')return hold(site,candidate.kind,result.reason);plot=result.plot;entrance=result.entrance;
  }
  pending.set(candidate.id,{site,kind:candidate.kind,plot,entrance});const [x,y]=reviewFacilityAnchor(candidate.kind,plot);return {status:'clear',x,y};
 },afterFacilities(state){
  for(const geometry of pendingBridges){
   const building=siteAt(state.observation?.sites,0,state.year)?.buildings.find(b=>b.id===geometry.bridgeId);
   if(!building||building.builtYear!==state.year||!building.recordId||review.bridgeReview!.bridges.some(b=>b.geometry.bridgeId===geometry.bridgeId))throw Error('Bridge transaction did not commit');
   (review.bridgeReview!.bridges as SavedReviewBridge[]).push({geometry,builtYear:state.year,sourceRecordId:building.recordId});
  }pendingBridges.length=0;
  for(const [id,p] of pending){
   const index=sites.indexOf(p.site),building=siteAt(state.observation?.sites,index,state.year)?.buildings.find(b=>b.id===id);
   if(!building||building.builtYear!==state.year||!building.recordId)throw Error('Facility/placement transaction did not commit');
   if(placements.some(old=>old.objectId===id))throw Error('Duplicate facility placement');
   placements.push({objectId:id,...p,builtYear:state.year,sourceRecordId:building.recordId});
  }pending.clear();extension?.afterFacilities(review,state);
 }};
}
function checkAdvance(years:number,choices:string,options:GeneratedAdvanceOptions){
 if(Object.keys(options).some(k=>!['stopAtNewRecord','observeEconomy'].includes(k)))throw Error('Unknown generated advance option');
 if(!Number.isSafeInteger(years)||years<0||years>10000||!['stop','automatic'].includes(choices))throw Error('Invalid generated review advance');
 if(options.stopAtNewRecord!==undefined&&typeof options.stopAtNewRecord!=='boolean')throw Error('Invalid generated record boundary');
 if(options.observeEconomy!==undefined&&typeof options.observeEconomy!=='function')throw Error('Invalid economy observer');
}
/** Caller owns this private batch. No live working reference crosses a public callback. */
export function createGeneratedFacilityBatch(input:GeneratedFacilityReview,extension?:GeneratedLandReviewExtension,observeEconomy?:EconomyObserver){
 const review=mutableCopy(input),policy=policyFor(review,extension,observeEconomy);
 return batchFor(review,policy);
}
/** Only the coupled annual kernel owns this mode and its prepared coefficients. */
export function createCoupledFacilityBatch(input:GeneratedFacilityReview,extension:GeneratedLandReviewExtension,prepare:()=>CoupledAnnualModifier,observeEconomy:EconomyObserver){
 const review=mutableCopy(input,'trial'),base=policyFor(review,extension,observeEconomy);
 return batchFor(review,{...base,mode:'irrigation-coupled-review-only',coupledEconomy:prepare},prepare);
}
/** Production-only annual adapter; its caller must own the full production root. */
export function createEconomicProductionFacilityBatch(input:GeneratedFacilityReview,extension:GeneratedLandReviewExtension,prepare:()=>CoupledAnnualModifier,observeEconomy:EconomyObserver){
 const review=mutableCopy(input,'production'),base=policyFor(review,extension,observeEconomy);
 return batchFor(review,{...base,mode:'irrigation-economic-production-v1',coupledEconomy:prepare},prepare);
}
/** Dedicated D4 adapter: future terrain stays private to the annual writer. */
export function createTerrainChangeFacilityBatch(input:GeneratedFacilityReview,extension:GeneratedLandReviewExtension,prepare:()=>CoupledAnnualModifier,observeEconomy:EconomyObserver,terrainAt:TerrainReviewProvider){
 const review=mutableCopy(input,'terrain-trial');bindTerrainReviewInternal(review,terrainAt);const base=policyFor(review,extension,observeEconomy);
 return batchFor(review,{...base,mode:'terrain-change-review-only',coupledEconomy:prepare},prepare);
}
function batchFor(review:GeneratedFacilityReview,policy:ReviewLandProgression,beforePhase?:()=>unknown){
 return {review,advance(years:number,choices:'stop'|'automatic',stopAtNewRecord?:boolean,onPhase?:LandPhaseObserver){
  checkAdvance(years,choices,{stopAtNewRecord});runGeneratedLandBatch(review.state,policy,years,choices,stopAtNewRecord,onPhase,beforePhase);
 },choose(index:number|'random',onPhase?:LandPhaseObserver){
  beforePhase?.();
  const s=review.state,before=s.rngState,confirmedBefore=lastObservedYear(s);
  const fingerprint=beforePhase?coupledChoiceBinding(s):undefined;let selected=index;
  if(index==='random')selected=chooseAutomatically(s,policy);else choose(s,index,'manual',policy);
  if(onPhase)onPhase(Object.freeze({phase:index==='random'?'automatic-choice':'manual-choice',year:s.year,confirmedBefore,confirmedAfter:lastObservedYear(s),rngBefore:before,rngAfter:s.rngState,pending:!!s.pending,...(fingerprint?{choice:Object.freeze({index:selected as number,fingerprint})}:{})}));
 }};
}
/** Input remains untouched even if proposal or commit throws. years counts new years, not choices. */
export function advanceGeneratedFacilityReview(input:GeneratedFacilityReview,years:number,choices:'stop'|'automatic'='stop',extension?:GeneratedLandReviewExtension,options:GeneratedAdvanceOptions={},onPhase?:LandPhaseObserver):GeneratedFacilityReview {
 checkAdvance(years,choices,options);const batch=createGeneratedFacilityBatch(input,extension,options.observeEconomy);
 batch.advance(years,choices,options.stopAtNewRecord,onPhase);return batch.review;
}
export function chooseGeneratedFacilityReview(input:GeneratedFacilityReview,index:number,source:'manual'|'auto'='manual',extension?:GeneratedLandReviewExtension,observeEconomy?:EconomyObserver):GeneratedFacilityReview {
 const next=mutableCopy(input);choose(next.state,index,source,policyFor(next,extension,observeEconomy));return next;
}
export function chooseAutomaticallyGeneratedFacilityReview(input:GeneratedFacilityReview,extension?:GeneratedLandReviewExtension,observeEconomy?:EconomyObserver):GeneratedFacilityReview {
 const next=mutableCopy(input);chooseAutomatically(next.state,policyFor(next,extension,observeEconomy));return next;
}

/** Production terrain owns a separate land boundary, sharing only the private batch mechanics. */
export function createTerrainProductionFacilityBatch(input:GeneratedFacilityReview,extension:GeneratedLandReviewExtension,prepare:()=>CoupledAnnualModifier,observeEconomy:EconomyObserver,terrainAt:TerrainReviewProvider){
 const review=mutableCopy(input,'terrain-production');bindTerrainReviewInternal(review,terrainAt);const base=policyFor(review,extension,observeEconomy);
 return batchFor(review,{...base,mode:'terrain-production-v1',coupledEconomy:prepare},prepare);
}
