/** Public generated land API; annual diagnostics stay in the internal batch entry. */
export type {ReviewFacilityPlacement,GeneratedFacilityReview,GeneratedLandReviewExtension,GeneratedAdvanceOptions} from './generated-facility-batch-internal.js';
export {createGeneratedFacilityReview,chooseGeneratedFacilityReview,chooseAutomaticallyGeneratedFacilityReview} from './generated-facility-batch-internal.js';
import {advanceGeneratedFacilityReview as advance,type GeneratedFacilityReview,type GeneratedLandReviewExtension,type GeneratedAdvanceOptions} from './generated-facility-batch-internal.js';
export function advanceGeneratedFacilityReview(input:GeneratedFacilityReview,years:number,choices:'stop'|'automatic'='stop',extension?:GeneratedLandReviewExtension,options:GeneratedAdvanceOptions={}):GeneratedFacilityReview {return advance(input,years,choices,extension,options);}
