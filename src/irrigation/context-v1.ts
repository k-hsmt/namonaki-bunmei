/** As-of adapter. It supplies geometry inputs, never advances or edits the live world. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {lastObservedYear} from '../story/engine.js';
import {siteAt} from '../story/settlement-history.js';
import {housingAt} from '../story/housing-history.js';
import {publicSpacesAt} from '../story/public-space-history.js';
import {withGeneratedBridgeAccess,validateGeneratedBridgeLedger} from '../story/generated-bridge-history-review.js';
import {selectReviewReservations} from '../terrain/facility-plan-review.js';
import {southEntrance} from '../terrain/ground-access-review.js';
import type {IrrigationContext} from './types-v1.js';
export function irrigationContextAt(world:GeneratedBridgeReview,causeRecordId:string):IrrigationContext {
 const r=world.review,end=lastObservedYear(r.state),causes=r.state.history.filter(e=>e.id===causeRecordId),cause=causes[0];
 if(causes.length!==1||!cause||cause.kind!=='irrigation'||cause.year<1||cause.year>end)throw Error('Missing confirmed irrigation cause');
 if(!r.bridgeReview)throw Error('Missing river ownership');validateGeneratedBridgeLedger(r);
 const year=cause.year,site='river-bank',view=siteAt(r.state.observation?.sites,0,year),homes=housingAt(r.state.housing,year,site),spaces=publicSpacesAt(r.state.publicSpaces,year,'generated-review-only');
 if(!view||homes.status!=='known'||spaces.status!=='known')throw Error('Unknown irrigation occupation');
 const placements=r.placements.filter(p=>p.site===site&&p.builtYear<=year),occupancy=[...placements.map(p=>({id:p.objectId,plot:p.plot,entrance:p.entrance})),...homes.blocks.map(b=>({id:b.blockId,plot:b.footprint,entrance:southEntrance(b.footprint)})),...spaces.spaces.filter(p=>p.siteId===site).map(p=>({id:p.id,plot:p.footprint,entrance:southEntrance(p.footprint)}))];
 const fields=placements.filter(p=>p.kind==='field'&&view.buildings.some(b=>b.id===p.objectId&&b.kind==='field'&&b.condition==='intact'&&b.builtYear===p.builtYear)).map(p=>{
  const source=r.state.history.find(e=>e.id===p.sourceRecordId);if(!source||source.kind!=='building-built'||source.year!==p.builtYear||source.buildingId!==p.objectId)throw Error('Missing field foundation source');return {id:p.objectId,plot:p.plot,builtYear:p.builtYear,sourceRecordId:p.sourceRecordId};
 });
 const ground=withGeneratedBridgeAccess(r,{terrain:r.terrain,site,year,confirmedYear:end,historyStatus:'known',primaryRoot:r.plans[site].primaryRoot,occupancy,reservations:selectReviewReservations(r.plans[site],r.reservationMode,new Set(occupancy.map(o=>o.id)))});
 return {ground,hydrology:r.bridgeReview.hydrology,roots:r.plans[site].accessRoots,fields,cause:{recordId:cause.id,year}};
}
