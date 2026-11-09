import type {EconomicProductionWorld} from './economic-production-types-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
/** Neutral algorithm view retains the economic boundary and never enters B's ownership cache. */
export function economicProductionViewInternal(input:EconomicProductionWorld):GeneratedBridgeReview {
 const {economicCoupling:_,...world}=input;return {...world,format:'generated-bridge-review',status:'review-only'};
}
