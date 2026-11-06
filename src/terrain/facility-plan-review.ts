/** D3-A trial logical facility slots. No live game integration or persisted policy. */
import {fixedFacilityLotReservations} from '../story/settlement-history.js';
import type {RecordPoint,RecordSite} from './terrain-record-types.js';
import type {ValidatedTerrainRecord} from './terrain-record.js';
import {proposeInitialAccess} from './initial-access-review.js';
import {findPlacementReview,type SearchReviewRequest} from './placement-search-review.js';
import {southEntrance,type GroundPurpose,type GroundOccupation,type GroundPlot} from './ground-access-review.js';
export type ReservationReviewMode='wide'|'field-only'|'none';
export interface ReviewFacilitySlot {readonly slot:number;readonly id:string;readonly kind:GroundPurpose|'bridge';readonly plot:GroundPlot|null;readonly reason:string|null}
export interface ReviewFacilityPlan {
 readonly status:'review-only';readonly site:RecordSite;readonly placementPolicy:null;
 readonly nucleus:RecordPoint;readonly primaryRoot:RecordPoint;readonly accessRoots:readonly RecordPoint[];
 readonly slots:readonly ReviewFacilitySlot[];
 readonly metrics:{readonly searches:number;readonly accessEvaluations:number;readonly scoreEvaluations:number};
}
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
export interface TypedGroundOccupation extends GroundOccupation {readonly kind:GroundPurpose|'bridge'}
/** Related targets must be confirmed occupation, never unbuilt reservations. */
export function reviewNeighborEntrances(purpose:GroundPurpose,occupancy:readonly TypedGroundOccupation[]):readonly RecordPoint[]{
 const kinds=purpose==='field'?['house']:purpose==='workshop'||purpose==='granary'?['field']:
  purpose==='civic'||purpose==='public-space'?['hall']:['house','housing'];
 return occupancy.filter(o=>kinds.includes(o.kind)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(o=>o.entrance);
}
export function planFacilitySitesReview(terrain:ValidatedTerrainRecord,site:RecordSite):ReviewFacilityPlan|{status:'hold';reason:string}{
 const initial=proposeInitialAccess(terrain,site);if(initial.status==='hold')return initial;
 const definitions=fixedFacilityLotReservations(sites.indexOf(site));
 if(definitions.length!==11)throw Error('Unexpected facility slot definitions');
 const slots:ReviewFacilitySlot[]=definitions.map((d,slot)=>({slot,id:d.id,kind:d.kind,plot:null,reason:d.kind==='bridge'?'unsupported-bridge':'not-searched'}));
 slots[0]={...slots[0]!,plot:initial.house,reason:null};
 const actual:TypedGroundOccupation[]=[{id:slots[0]!.id,kind:'house',plot:initial.house,entrance:southEntrance(initial.house)}];
 const metrics={searches:0,accessEvaluations:0,scoreEvaluations:0};
 // Stable D0 planning order; previous proposals are kept disjoint, without
 // promoting reservations to confirmed neighboring buildings or blocked roads.
 for(const slot of [1,3,2,4,5,6,8,9,10]){
  const definition=slots[slot]!,purpose=definition.kind as GroundPurpose;
  const request:SearchReviewRequest={objectId:definition.id,purpose,width:purpose==='field'?26:18,depth:purpose==='field'?14:7,
   nucleus:initial.nucleus,neighborEntrances:reviewNeighborEntrances(purpose,actual)};
  const result=findPlacementReview({terrain,site,year:0,confirmedYear:0,historyStatus:'known',primaryRoot:initial.primaryRoot,occupancy:actual,
   reservations:slots.filter(s=>s.slot!==0&&s.plot!==null).map(s=>({id:s.id,plot:s.plot!}))},request);
  metrics.searches++;metrics.accessEvaluations+=result.metrics.accessEvaluations;metrics.scoreEvaluations+=result.metrics.scoreEvaluations;
  if(result.status==='review-only')slots[slot]={...definition,plot:result.plot,reason:null};
  else {slots[slot]={...definition,reason:result.reason};if(slot===1)return {status:'hold',reason:'initial-field-'+result.reason};}
 }
 return {status:'review-only',placementPolicy:null,site,nucleus:initial.nucleus,primaryRoot:initial.primaryRoot,accessRoots:initial.accessRoots,slots,metrics};
}
export function selectReviewReservations(plan:ReviewFacilityPlan,mode:ReservationReviewMode,builtIds:ReadonlySet<string>=new Set()):readonly {id:string;plot:GroundPlot}[]{
 if(!['wide','field-only','none'].includes(mode))throw Error('Unknown reservation review mode');
 return plan.slots.filter(s=>s.slot>0&&s.kind!=='bridge'&&s.plot!==null&&!builtIds.has(s.id)&&
  (mode==='wide'||mode==='field-only'&&s.kind==='field')).map(s=>({id:s.id,plot:s.plot!}));
}
/** Existing anchor conventions are inverted in one place, without sprite bounds. */
export function reviewFacilityAnchor(kind:Exclude<GroundPurpose,'public-space'>,plot:GroundPlot):RecordPoint {
 return kind==='field'?[plot.x+13,plot.y+8]:kind==='civic'?[plot.x+Math.floor(plot.width/2),plot.y+plot.depth-5]:
  [plot.x+Math.floor(plot.width/2),plot.y+plot.depth-3];
}
