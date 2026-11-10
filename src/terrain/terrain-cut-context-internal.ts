/** As-of agricultural source adapter. Caller owns and validates the whole D4 world. */
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {lastObservedYear} from '../story/engine.js';
import {siteAt} from '../story/settlement-history.js';
import {housingAt} from '../story/housing-history.js';
import {publicSpacesAt} from '../story/public-space-history.js';
import {selectReviewReservations} from './facility-plan-review.js';
import {southEntrance} from './ground-access-review.js';
import {resolveTerrainAtYear,type TerrainHistory} from './terrain-revision-v1.js';
import type {TerrainCutContext} from './terrain-earthwork-v1.js';
export function terrainCutContextsAtInternal(review:GeneratedFacilityReview,history:TerrainHistory,year:number):readonly TerrainCutContext[]{
 if(!Number.isSafeInteger(year)||year<0||year>lastObservedYear(review.state)||history.confirmedThrough!==year||history.initial!==review.terrain)throw Error('Invalid terrain source prefix');
 const site='hill-side',index=1,current=siteAt(review.state.observation?.sites,index,year),homes=housingAt(review.state.housing,year,site),spaces=publicSpacesAt(review.state.publicSpaces,year,'generated-review-only');
 if(!current||homes.status!=='known'||spaces.status!=='known')throw Error('Unknown terrain source occupation');
 const placements=review.placements.filter(p=>p.site===site&&p.builtYear<=year),occupancy=[...placements.map(p=>({id:p.objectId,plot:p.plot,entrance:p.entrance})),...homes.blocks.map(b=>({id:b.blockId,plot:b.footprint,entrance:southEntrance(b.footprint)})),...spaces.spaces.filter(p=>p.siteId===site).map(p=>({id:p.id,plot:p.footprint,entrance:southEntrance(p.footprint)}))];
 const terrain=resolveTerrainAtYear(history,year),ground={terrain,site,year,confirmedYear:year,historyStatus:'known' as const,primaryRoot:review.plans[site].primaryRoot,occupancy,reservations:selectReviewReservations(review.plans[site],review.reservationMode,new Set(occupancy.map(o=>o.id)))} as const;
 return placements.filter(p=>p.kind==='field'&&p.builtYear<=year-49&&current.buildings.some(b=>b.id===p.objectId&&b.kind==='field'&&b.condition!=='ruined')&&siteAt(review.state.observation?.sites,index,year-49)?.buildings.some(b=>b.id===p.objectId&&b.condition!=='ruined')&&!(review.state.observation?.sites?.[index]?.buildingChanges??[]).some(c=>c.year>year-49&&c.year<=year&&c.building.id===p.objectId&&c.building.condition==='ruined'))
  .sort((a,b)=>a.builtYear-b.builtYear||(a.objectId<b.objectId?-1:a.objectId>b.objectId?1:0))
  .map(p=>{const source=review.state.history.find(e=>e.id===p.sourceRecordId);if(!source||source.kind!=='building-built'||source.year!==p.builtYear||source.buildingId!==p.objectId)throw Error('Missing terrain agricultural foundation');return {history,ground,field:{id:p.objectId,plot:p.plot,builtYear:p.builtYear,sourceRecordId:p.sourceRecordId},causeRecordId:'terrain-review-'+year,protectedPlots:[]};});
}
