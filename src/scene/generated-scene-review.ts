import {projectProductionEnvironment,productionChannelAt} from '../irrigation/production-history-v1.js';
import {environmentProjection,validateEnvironment,validateCoupledVegetation} from '../environment/history-v1.js';
/** D4-A confirmed generated observation. No game-mode or storage activation. */
import {vegetationAt,validateVegetationHistory} from '../vegetation/history-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {validateGeneratedBridgeLedger} from '../story/generated-bridge-history-review.js';
import {validateGeneratedPublicSpaceLedger} from '../story/generated-public-space-review.js';
import {lastObservedYear} from '../story/engine.js';
import {readOwnedTerrainRecord} from '../terrain/terrain-record.js';
import {snapshotAt,type SiteSnapshot} from './model.js';
import type {SceneComposition} from './composition.js';
import {composeGeneratedScene,type GeneratedSceneGround} from './generated-ground-review.js';
export interface GeneratedSceneObservation {readonly snapshot:SiteSnapshot;readonly composition:SceneComposition;readonly ground:GeneratedSceneGround}
export function observeGeneratedSceneReview(input:GeneratedBridgeReview,year:number,siteIndex=0):GeneratedSceneObservation {
 if(input.environmentAppearance!==undefined&&(!['landscape-v2','landscape-v3'].includes(input.environmentAppearance)||!input.environment))throw Error('Invalid environment appearance');
 if(input.format!=='generated-bridge-review'||input.status!=='review-only'||!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Invalid generated scene boundary');
 const review={...input.review,terrain:readOwnedTerrainRecord(input.review.terrain)};
 validateGeneratedBridgeLedger(review);validateGeneratedPublicSpaceLedger(review,lastObservedYear(review.state));
 const site=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex]!,snapshot=snapshotAt(review.state,year,siteIndex,'generated-review-only');
 if(!input.environment&&input.vegetation?.schemaVersion===2)throw Error('Missing environment');
 const ecology=input.irrigation?projectProductionEnvironment(input,year,site):input.environment?(()=>{const v=validateCoupledVegetation(input.vegetation,review);return environmentProjection(validateEnvironment(input.environment,v,review),v,review,year,site);})():input.vegetation?{vegetation:vegetationAt(validateVegetationHistory(input.vegetation,review),year,site)}:{};
 const ground:GeneratedSceneGround={...ecology,...((input.irrigation&&year<=input.irrigation.introducedYear)?(input.irrigation.preIntroductionRendererId==='generated-scene-v5'?{environmentAppearance:'landscape-v3' as const}:input.irrigation.preIntroductionRendererId==='generated-scene-v4'?{environmentAppearance:'landscape-v2' as const}:{}):(input.environmentAppearance?{environmentAppearance:input.environmentAppearance}:{})),...(input.irrigation?{channelView:productionChannelAt(input,year,site)}:{}),terrain:review.terrain,site,primaryRoot:review.plans[site].primaryRoot,
  facilities:review.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,purpose:p.kind,plot:p.plot})),
  bridges:site==='river-bank'?review.bridgeReview!.bridges.filter(b=>b.builtYear<=year).map(b=>b.geometry):[]};
 return {snapshot,ground,composition:composeGeneratedScene(snapshot,review.state.housing,ground)};
}
