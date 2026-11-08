import {validateProductionWorld} from '../irrigation/production-history-v1.js';
import {advanceProductionEnvironment} from '../irrigation/production-progression-v1.js';
import type {ProductionIrrigation} from '../irrigation/production-types-v1.js';
import {validateCoupledVegetation,validateEnvironment,type CoupledVegetation,type EnvironmentHistory} from '../environment/history-v1.js';
import {advanceEnvironment} from '../environment/progression-v1.js';
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
export interface GeneratedBridgeReview {readonly format:'generated-bridge-review';readonly status:'review-only';readonly review:GeneratedFacilityReview;readonly irrigation?:ProductionIrrigation;readonly vegetation?:VegetationHistory|CoupledVegetation;readonly environment?:EnvironmentHistory;readonly environmentAppearance?:'landscape-v2'|'landscape-v3'}
export function createGeneratedBridgeReview(terrain:ValidatedTerrainRecord,hydrology:ValidatedRiverReaches,mode:ReservationReviewMode,growthPattern?:GrowthPattern):GeneratedBridgeReview|{status:'hold';reason:string}{
 const saved=validateRiverReaches(hydrology,terrain),parent=createGeneratedPublicSpaceReview(terrain,mode,growthPattern);
 return parent.status==='hold'?parent:{format:'generated-bridge-review',status:'review-only',review:{...parent.review,bridgeReview:{schemaVersion:1,hydrology:saved,bridges:[]}}};
}
function check(input:GeneratedBridgeReview){
 if(input.environmentAppearance!==undefined&&(!['landscape-v2','landscape-v3'].includes(input.environmentAppearance)||!input.environment))throw Error('Invalid environment appearance');
 if(input.format!=='generated-bridge-review'||input.status!=='review-only')throw Error('Invalid bridge review boundary');
 if(input.irrigation){validateProductionWorld(input);}else if(input.environment){if(input.vegetation?.schemaVersion!==2)throw Error('Missing coupled vegetation');validateEnvironment(input.environment,validateCoupledVegetation(input.vegetation,input.review),input.review);}else if(input.vegetation)validateVegetationHistory(input.vegetation,input.review);
 validateGeneratedBridgeLedger(input.review);validateGeneratedPublicSpaceLedger(input.review,lastObservedYear(input.review.state));
}
/** Validated production inputs own immutable plans/hydrology; land advancement only appends bridges and placements. */
function productionLand(input:GeneratedBridgeReview,next:GeneratedFacilityReview):GeneratedFacilityReview {return input.irrigation?{...next,plans:input.review.plans,bridgeReview:{...next.bridgeReview!,hydrology:input.review.bridgeReview!.hydrology}}:next;}
function finish(result:GeneratedBridgeReview):GeneratedBridgeReview {
 const next=result.irrigation?advanceProductionEnvironment(result):result.environment?{...result,...advanceEnvironment(result.environment,result.vegetation as CoupledVegetation,result.review)}:result.vegetation?{...result,vegetation:syncVegetationHistory(result.vegetation as VegetationHistory,result.review)}:result;check(next);return next;
}
export function advanceGeneratedBridgeReview(input:GeneratedBridgeReview,years:number,choices:'stop'|'automatic'='stop',options:GeneratedAdvanceOptions={}):GeneratedBridgeReview {
 check(input);const result={...input,review:productionLand(input,advanceGeneratedFacilityReview(input.review,years,choices,generatedPublicSpaceExtension,options))};return finish(result);
}
export function chooseGeneratedBridgeReview(input:GeneratedBridgeReview,index:number):GeneratedBridgeReview {
 check(input);const result={...input,review:productionLand(input,chooseGeneratedFacilityReview(input.review,index,'manual',generatedPublicSpaceExtension))};return finish(result);
}
export function chooseAutomaticallyGeneratedBridgeReview(input:GeneratedBridgeReview):GeneratedBridgeReview {
 check(input);const result={...input,review:productionLand(input,chooseAutomaticallyGeneratedFacilityReview(input.review,generatedPublicSpaceExtension))};return finish(result);
}
