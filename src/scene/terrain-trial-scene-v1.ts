import {housingAt} from '../story/housing-history.js';
/** Recorded D4 observation uses the same year's real ecology and resolved physical ground. */
import type {TerrainTrialWorld} from '../terrain/terrain-trial-types-v1.js';
import {knownTerrainTrialWorldInternal,terrainTrialViewInternal} from '../terrain/terrain-trial-owned-internal.js';
import {resolveTerrainAtYear} from '../terrain/terrain-revision-v1.js';
import {projectRecordedEnvironmentInternal,productionChannelAt} from '../irrigation/production-history-v1.js';
import {snapshotAt} from './model.js';
import {composeGeneratedScene,type GeneratedSceneGround} from './generated-ground-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
export function observeTerrainTrialScene(world:TerrainTrialWorld,year:number,siteIndex=0):GeneratedSceneObservation {
 knownTerrainTrialWorldInternal(world);if(!Number.isSafeInteger(year)||year<0||year>world.terrainChanges.confirmedThrough||!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Unconfirmed terrain scene');
 const r=world.review,site=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex]!,snapshot=snapshotAt(r.state,year,siteIndex,'generated-review-only'),i=world.irrigation!,view=terrainTrialViewInternal(world),appearance=year<=i.introducedYear?(i.preIntroductionRendererId==='generated-scene-v5'?'landscape-v3':i.preIntroductionRendererId==='generated-scene-v4'?'landscape-v2':undefined):world.environmentAppearance;
 const ground:GeneratedSceneGround={...projectRecordedEnvironmentInternal(view,year,site),...(appearance?{environmentAppearance:appearance}:{}),channelView:productionChannelAt(view,year,site),terrain:resolveTerrainAtYear(world.terrainHistory,year),site,primaryRoot:r.plans[site].primaryRoot,facilities:r.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,purpose:p.kind,plot:p.plot})),bridges:site==='river-bank'?r.bridgeReview!.bridges.filter(b=>b.builtYear<=year).map(b=>b.geometry):[]};
 return {snapshot,ground,composition:composeGeneratedScene(snapshot,r.state.housing,ground)};
}
export function terrainCutUseAt(world:TerrainTrialWorld,year:number){
 const observed=observeTerrainTrialScene(world,year,1),overlap=(a:{x:number;y:number;width:number;depth:number},b:{x:number;y:number;width:number;depth:number})=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
 return world.terrainHistory.events.filter(e=>e.effectiveYear<=year).map(e=>{
  const placements=world.review.placements.filter(p=>p.site==='hill-side'&&p.builtYear>=e.effectiveYear&&p.builtYear<=year&&overlap(p.plot,e.plot)),activeFields=placements.filter(p=>p.kind==='field'&&observed.snapshot.objects.some(b=>b.id===p.objectId&&b.condition!=='ruined')),pastFields=placements.filter(p=>p.kind==='field'),other=placements.filter(p=>p.kind!=='field'&&observed.snapshot.objects.some(b=>b.id===p.objectId)),homes=housingAt(world.review.state.housing,year,'hill-side').blocks.filter(b=>b.builtYear>=e.effectiveYear&&overlap(b.footprint,e.plot)),spaces=(observed.snapshot.publicSpaces??[]).filter(p=>p.establishedYear>=e.effectiveYear&&overlap(p.footprint,e.plot)),otherIds=[...other.map(p=>p.objectId),...homes.map(b=>b.blockId),...spaces.map(p=>p.id)];
  return {id:e.id,status:activeFields.length?'cultivated' as const:pastFields.length?'abandoned' as const:otherIds.length?'built-over' as const:'prepared' as const,activeFieldIds:activeFields.map(p=>p.objectId),otherBuildingIds:otherIds};
 });
}
