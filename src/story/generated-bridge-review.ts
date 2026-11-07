/** D3-C complete generated land trial, isolated from the live game/save writer. */
import {syncVegetationHistory,validateVegetationHistory,type VegetationHistory} from '../vegetation/history-v1.js';
import type {ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import {validateRiverReaches,type ValidatedRiverReaches} from '../terrain/river-reaches-review.js';
import type {ReservationReviewMode} from '../terrain/facility-plan-review.js';
import type {GrowthPattern} from '../terrain/organic-placement-v2.js';
import {createGeneratedPublicSpaceReview,generatedPublicSpaceExtension,validateGeneratedPublicSpaceLedger} from './generated-public-space-review.js';
import {advanceGeneratedFacilityReview,chooseGeneratedFacilityReview,chooseAutomaticallyGeneratedFacilityReview,type GeneratedFacilityReview,type GeneratedAdvanceOptions} from './generated-facility-review.js';
import {validateGeneratedBridgeLedger} from './generated-bridge-history-review.js';
import {lastObservedYear} from './engine.js';
export interface GeneratedBridgeReview {readonly format:'generated-bridge-review';readonly status:'review-only';readonly review:GeneratedFacilityReview;readonly vegetation?:VegetationHistory}
export function createGeneratedBridgeReview(terrain:ValidatedTerrainRecord,hydrology:ValidatedRiverReaches,mode:ReservationReviewMode,growthPattern?:GrowthPattern):GeneratedBridgeReview|{status:'hold';reason:string}{
 const saved=validateRiverReaches(hydrology,terrain),parent=createGeneratedPublicSpaceReview(terrain,mode,growthPattern);
 return parent.status==='hold'?parent:{format:'generated-bridge-review',status:'review-only',review:{...parent.review,bridgeReview:{schemaVersion:1,hydrology:saved,bridges:[]}}};
}
function check(input:GeneratedBridgeReview){
 if(input.format!=='generated-bridge-review'||input.status!=='review-only')throw Error('Invalid bridge review boundary');
 if(input.vegetation)validateVegetationHistory(input.vegetation,input.review);
 validateGeneratedBridgeLedger(input.review);validateGeneratedPublicSpaceLedger(input.review,lastObservedYear(input.review.state));
}
function finish(result:GeneratedBridgeReview):GeneratedBridgeReview {
 const next=result.vegetation?{...result,vegetation:syncVegetationHistory(result.vegetation,result.review)}:result;check(next);return next;
}
export function advanceGeneratedBridgeReview(input:GeneratedBridgeReview,years:number,choices:'stop'|'automatic'='stop',options:GeneratedAdvanceOptions={}):GeneratedBridgeReview {
 check(input);const result={...input,review:advanceGeneratedFacilityReview(input.review,years,choices,generatedPublicSpaceExtension,options)};return finish(result);
}
export function chooseGeneratedBridgeReview(input:GeneratedBridgeReview,index:number):GeneratedBridgeReview {
 check(input);const result={...input,review:chooseGeneratedFacilityReview(input.review,index,'manual',generatedPublicSpaceExtension)};return finish(result);
}
export function chooseAutomaticallyGeneratedBridgeReview(input:GeneratedBridgeReview):GeneratedBridgeReview {
 check(input);const result={...input,review:chooseAutomaticallyGeneratedFacilityReview(input.review,generatedPublicSpaceExtension)};return finish(result);
}
