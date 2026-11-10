import {terrainForReviewAtInternal} from './terrain-review-binding-internal.js';
/** Immutable v5 draft land births and original access, reconstructed from saved history. */
import type {GeneratedFacilityReview} from './generated-facility-review.js';
import type {RecordSite,RecordPoint} from '../terrain/terrain-record-types.js';
import {siteAt} from './settlement-history.js';
import {selectReviewReservations} from '../terrain/facility-plan-review.js';
import {reviewGroundAccess,groundContextWindows,groundReachParents,type GroundPlot,type GroundPurpose,type GroundOccupation,type GroundReviewContext} from '../terrain/ground-access-review.js';
import {bridgeOccupancy,bridgeCrossing,type ValidatedBridgeGeometry} from '../terrain/bridge-geometry-review.js';
import {decodeRecordPhysics} from '../terrain/terrain-record-raster-v1.js';
export interface ReviewLandFoundation {
 readonly year:number;readonly seq:number;readonly objectId:string;readonly site:RecordSite;readonly purpose:GroundPurpose|'bridge';readonly sourceRecordId:string;
 readonly placement:{readonly schemaVersion:1;readonly plot:GroundPlot;readonly entrance:RecordPoint;readonly access:readonly RecordPoint[];readonly bridge?:ValidatedBridgeGeometry};
}
export interface GeneratedLandFoundationsReview {readonly schemaVersion:1;readonly events:readonly ReviewLandFoundation[]}
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
interface Birth {id:string;site:RecordSite;purpose:GroundPurpose|'bridge';year:number;source:string;plot:GroundPlot;bridge?:ValidatedBridgeGeometry}
/** Order comes from actual source records, not current array length or a new search. */
export function captureGeneratedLandFoundations(review:GeneratedFacilityReview):GeneratedLandFoundationsReview {
 const records=new Map(review.state.history.map((r,index)=>[r.id,{r,index}])),births:Birth[]=review.placements.map(p=>({id:p.objectId,site:p.site,purpose:p.kind,year:p.builtYear,source:p.sourceRecordId,plot:p.plot}));
 for(const e of review.state.housing!.events)if(e.kind==='built')births.push({id:e.blockId,site:e.after.siteId,purpose:'housing',year:e.year,source:e.causeRecordId!,plot:e.after.footprint});
 for(const e of review.state.publicSpaces!.events)if(e.kind==='established')births.push({id:e.spaceId,site:e.after.siteId,purpose:'public-space',year:e.year,source:e.causeRecordId,plot:e.after.footprint});
 for(const b of review.bridgeReview!.bridges)births.push({id:b.geometry.bridgeId,site:'river-bank',purpose:'bridge',year:b.builtYear,source:b.sourceRecordId,plot:b.geometry.deck,bridge:b.geometry});
 for(const b of births){
  const source=records.get(b.source)?.r,initial=b.year===0&&b.id===b.site+'-0'&&b.purpose==='house';
  if(!source||source.year!==b.year||!initial&&(source.kind!==(b.purpose==='housing'?'housing-built':b.purpose==='public-space'?'public-space-established':'building-built')||(b.purpose==='public-space'?source.publicSpaceId:source.buildingId)!==b.id))throw Error('Invalid land foundation source');
 }
 births.sort((a,b)=>a.year-b.year||records.get(a.source)!.index-records.get(b.source)!.index||sites.indexOf(a.site)-sites.indexOf(b.site));
 const occupied={} as Record<RecordSite,GroundOccupation[]>;for(const site of sites)occupied[site]=[];
 const bridges:ValidatedBridgeGeometry[]=[],events:ReviewLandFoundation[]=[],ids=new Set<string>();
 for(const b of births){
  if(ids.has(b.id))throw Error('Duplicate land foundation');ids.add(b.id);
  const plan=review.plans[b.site],occupancy=occupied[b.site],site=siteAt(review.state.observation?.sites,sites.indexOf(b.site),b.year);
  const crossings=bridges.filter(g=>g.siteId===b.site&&site?.buildings.some(x=>x.id===g.bridgeId&&x.condition==='intact')).map(bridgeCrossing);
  const ctx:GroundReviewContext={terrain:terrainForReviewAtInternal(review,b.year,b.site),site:b.site,year:b.year,confirmedYear:b.year,historyStatus:'known',primaryRoot:plan.primaryRoot,occupancy,crossings,
   reservations:selectReviewReservations(plan,review.reservationMode,new Set(occupancy.map(p=>p.id)))};
  let entrance:RecordPoint,access:readonly RecordPoint[];
  if(b.bridge){
   const g=b.bridge,after={...ctx,occupancy:[...occupancy,...bridgeOccupancy(g)],crossings:[...crossings,bridgeCrossing(g)]};
   const parents=groundReachParents(groundContextWindows(decodeRecordPhysics(ctx.terrain.sites[b.site].physics),after),plan.primaryRoot),path:RecordPoint[]=[];
   entrance=g.bankA;let i=entrance[1]*320+entrance[0];if(!Number.isSafeInteger(i)||i<0||i>=parents.length||parents[i]===-1)throw Error('Bridge birth access missing');
   while(true){if(path.length>=parents.length||!Number.isSafeInteger(i)||i<0||i>=parents.length||parents[i]===-1)throw Error('Invalid bridge birth path');path.push([i%320,Math.floor(i/320)]);if(parents[i]===i)break;i=parents[i]!;}access=path.reverse();
   occupancy.push(...bridgeOccupancy(g));bridges.push(g);
  }else{
   const result=reviewGroundAccess(ctx,b.purpose as GroundPurpose,b.id,b.plot);if(result.status!=='clear')throw Error('Invalid land foundation: '+b.id+':'+result.reason);
   entrance=result.entrance;access=result.access;occupancy.push({id:b.id,plot:b.plot,entrance});
  }
  const previous=events.at(-1);events.push({year:b.year,seq:previous?.year===b.year?previous.seq+1:0,objectId:b.id,site:b.site,purpose:b.purpose,sourceRecordId:b.source,
   placement:{schemaVersion:1,plot:b.plot,entrance,access,...(b.bridge?{bridge:b.bridge}:{})}});
 }
 return {schemaVersion:1,events};
}
