/** Saved bridge geometry and observation-time access, independent of generators. */
import type {GeneratedFacilityReview} from './generated-facility-review.js';
import {siteAt} from './settlement-history.js';
import {housingAt} from './housing-history.js';
import {publicSpacesAt} from './public-space-history.js';
import {lastObservedYear} from './engine.js';
import {validateRiverReaches,type ValidatedRiverReaches} from '../terrain/river-reaches-review.js';
import {validateBridgeGeometry,bridgeOccupancy,bridgeCrossing,proposeBridgeGeometry,type ValidatedBridgeGeometry} from '../terrain/bridge-geometry-review.js';
import {southEntrance,type GroundReviewContext} from '../terrain/ground-access-review.js';
import {selectReviewReservations} from '../terrain/facility-plan-review.js';
export interface SavedReviewBridge {
 readonly geometry:ValidatedBridgeGeometry;readonly builtYear:number;readonly sourceRecordId:string;
}
export interface BridgeHistoryReview {
 readonly schemaVersion:1;readonly hydrology:ValidatedRiverReaches;readonly bridges:readonly SavedReviewBridge[];
}
export function reviewBridgeAnchor(g:ValidatedBridgeGeometry):readonly [number,number]{return [g.deck.x+Math.floor(g.deck.width/2),g.deck.y+2];}
/** Footprints survive damage and abandonment. Only an intact observed deck walks. */
export function withGeneratedBridgeAccess(review:GeneratedFacilityReview,ctx:GroundReviewContext):GroundReviewContext {
 if(!review.bridgeReview||ctx.site!=='river-bank')return ctx;
 const bridges=review.bridgeReview.bridges.filter(b=>b.builtYear<=ctx.year),site=siteAt(review.state.observation?.sites,0,ctx.year);
 return {...ctx,occupancy:[...ctx.occupancy,...bridges.flatMap(b=>bridgeOccupancy(b.geometry))],
  crossings:[...(ctx.crossings??[]),...bridges.filter(b=>site?.buildings.some(x=>x.id===b.geometry.bridgeId&&x.condition==='intact')).map(b=>bridgeCrossing(b.geometry))]};
}
const failed=new WeakMap<object,Set<string>>();
export function proposeGeneratedBridge(review:GeneratedFacilityReview,ctx:GroundReviewContext,id:string){
 const h=review.bridgeReview;if(!h)throw Error('Missing saved bridge hydrology');
 const plan=review.plans['river-bank'];
 const key=JSON.stringify([id,h.hydrology,plan.accessRoots,plan.nucleus,ctx.primaryRoot,ctx.occupancy,ctx.reservations,ctx.crossings]);
 let misses=failed.get(review.terrain);if(!misses){misses=new Set();failed.set(review.terrain,misses);}
 if(misses.has(key))return {status:'hold' as const,reason:'no-safe-bridge'};
 const result=proposeBridgeGeometry(ctx,h.hydrology,plan.accessRoots,plan.nucleus,id);
 if(result.status==='hold'&&result.reason==='no-safe-bridge')misses.add(key);return result;
}
/** Checks the saved foundation against the occupancy preceding later land stages. */
export function validateGeneratedBridgeLedger(review:GeneratedFacilityReview){
 const h=review.bridgeReview;if(!h||h.schemaVersion!==1||Object.keys(h).some(k=>!['schemaVersion','hydrology','bridges'].includes(k))||!Array.isArray(h.bridges))throw Error('Invalid bridge history');
 validateRiverReaches(h.hydrology,review.terrain);
 if(h.bridges.length>1)throw Error('Duplicate bridge foundation');
 const year=lastObservedYear(review.state),records=new Map(review.state.history.map(r=>[r.id,r]));
 if(records.size!==review.state.history.length)throw Error('Duplicate bridge source record');
 for(const saved of h.bridges){
  if(Object.keys(saved).length!==3||Object.keys(saved).some(k=>!['geometry','builtYear','sourceRecordId'].includes(k)))throw Error('Unknown bridge foundation fields');
  const g=validateBridgeGeometry(saved.geometry,review.terrain,h.hydrology),source=records.get(saved.sourceRecordId);
  if(g.bridgeId!=='river-bank-7'||!Number.isSafeInteger(saved.builtYear)||saved.builtYear<1||saved.builtYear>year||source?.kind!=='building-built'||source.buildingId!==g.bridgeId||source.year!==saved.builtYear)throw Error('Invalid bridge birth source');
  const changes=review.state.observation?.sites?.[0]?.buildingChanges.filter(c=>c.building.id===g.bridgeId)??[];
  const [x,y]=reviewBridgeAnchor(g),first=changes[0];
  if(!first||first.year!==saved.builtYear||first.building.condition!=='intact'||first.building.recordId!==saved.sourceRecordId)throw Error('Missing bridge birth');
  let previousCondition:string|undefined,previousYear=-1;
  for(const c of changes){
   const b=c.building,r=records.get(b.recordId??'');
   if(c.year>year||c.year<saved.builtYear||b.kind!=='bridge'||b.civic||b.builtYear!==saved.builtYear||b.x!==x||b.y!==y||!['intact','damaged','ruined'].includes(b.condition)||r?.year!==c.year||r.buildingId!==g.bridgeId||!['building-built','building-damaged','building-abandoned','building-repaired','building-reused'].includes(r.kind??''))throw Error('Bridge foundation or condition source changed');
   const expected:Record<string,string>={'building-built':'intact','building-damaged':'damaged','building-abandoned':'ruined','building-repaired':'intact','building-reused':'intact'};
   if(c.year<=previousYear||b.condition!==expected[r.kind!]||r.kind==='building-built'&&previousCondition!==undefined||r.kind==='building-damaged'&&previousCondition!=='intact'||r.kind==='building-repaired'&&previousCondition!=='damaged'||r.kind==='building-reused'&&previousCondition!=='ruined'||r.kind==='building-abandoned'&&(!previousCondition||previousCondition==='ruined'))throw Error('Invalid bridge condition transition');
   previousCondition=b.condition;previousYear=c.year;
  }
  const view=review.state.observation?.sites?.[0]?.view.buildings.find(b=>b.id===g.bridgeId);
  if(!view||JSON.stringify(view)!==JSON.stringify(changes.at(-1)!.building))throw Error('Bridge view disagrees with history');
  const site='river-bank',plan=review.plans[site],homes=housingAt(review.state.housing,saved.builtYear,site),spaces=publicSpacesAt(review.state.publicSpaces,saved.builtYear,'generated-review-only');
  if(homes.status!=='known'||spaces.status!=='known')throw Error('Unknown bridge foundation occupancy');
  const occupancy=[...review.placements.filter(p=>p.site===site&&(p.builtYear<saved.builtYear||p.builtYear===saved.builtYear&&p.kind!=='civic')).map(p=>({id:p.objectId,plot:p.plot,entrance:p.entrance})),
   ...homes.blocks.filter(b=>b.builtYear<saved.builtYear).map(b=>({id:b.blockId,plot:b.footprint,entrance:southEntrance(b.footprint)})),
   ...spaces.spaces.filter(p=>p.siteId===site&&p.establishedYear<saved.builtYear).map(p=>({id:p.id,plot:p.footprint,entrance:southEntrance(p.footprint)}))];
  const ctx:GroundReviewContext={terrain:review.terrain,site,year:saved.builtYear,confirmedYear:saved.builtYear,historyStatus:'known',primaryRoot:plan.primaryRoot,occupancy,
   reservations:selectReviewReservations(plan,review.reservationMode,new Set(occupancy.map(p=>p.id)))};
  const proposal=proposeBridgeGeometry(ctx,h.hydrology,plan.accessRoots,plan.nucleus,g.bridgeId);
  if(proposal.status!=='proposed'||JSON.stringify(proposal.geometry)!==JSON.stringify(g))throw Error('Saved bridge disagrees with foundation search');
 }
 for(const [index,site] of (review.state.observation?.sites??[]).entries())for(const b of [...site.view.buildings,...site.buildingChanges.map(c=>c.building)])if(b.kind==='bridge'&&(index!==0||!h.bridges.some(saved=>saved.geometry.bridgeId===b.id)))throw Error('Bridge geometry missing');
 if(review.placements.some(p=>(p.kind as string)==='bridge'))throw Error('Bridge cannot use an ordinary plot');
}
