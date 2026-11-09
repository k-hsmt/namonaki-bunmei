/** Public B progression has no annual control or economic modifier callback. */
export type {GeneratedBridgeReview} from './generated-bridge-batch-internal.js';
export {createGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview} from './generated-bridge-batch-internal.js';
import {advanceGeneratedBridgeReview as advance,type GeneratedBridgeReview} from './generated-bridge-batch-internal.js';
import type {GeneratedAdvanceOptions} from './generated-facility-review.js';
export function advanceGeneratedBridgeReview(input:GeneratedBridgeReview,years:number,choices:'stop'|'automatic'='stop',options:GeneratedAdvanceOptions={}):GeneratedBridgeReview {return advance(input,years,choices,options);}
