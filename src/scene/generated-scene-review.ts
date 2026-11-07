/** D4-A confirmed generated observation. No game-mode or storage activation. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {validateGeneratedBridgeLedger} from '../story/generated-bridge-history-review.js';
import {validateGeneratedPublicSpaceLedger} from '../story/generated-public-space-review.js';
import {lastObservedYear} from '../story/engine.js';
import {validateTerrainRecord} from '../terrain/terrain-record.js';
import {snapshotAt,type SiteSnapshot} from './model.js';
import type {SceneComposition} from './composition.js';
import {composeGeneratedScene,type GeneratedSceneGround} from './generated-ground-review.js';
export interface GeneratedSceneObservation {readonly snapshot:SiteSnapshot;readonly composition:SceneComposition;readonly ground:GeneratedSceneGround}
export function observeGeneratedSceneReview(input:GeneratedBridgeReview,year:number,siteIndex=0):GeneratedSceneObservation {
 if(input.format!=='generated-bridge-review'||input.status!=='review-only'||!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Invalid generated scene boundary');
 const review={...input.review,terrain:validateTerrainRecord(input.review.terrain)};
 validateGeneratedBridgeLedger(review);validateGeneratedPublicSpaceLedger(review,lastObservedYear(review.state));
 const site=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex]!,snapshot=snapshotAt(review.state,year,siteIndex,'generated-review-only');
 const ground:GeneratedSceneGround={terrain:review.terrain,site,
  facilities:review.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,purpose:p.kind,plot:p.plot})),
  bridges:site==='river-bank'?review.bridgeReview!.bridges.filter(b=>b.builtYear<=year).map(b=>b.geometry):[]};
 return {snapshot,ground,composition:composeGeneratedScene(snapshot,review.state.housing,ground)};
}
