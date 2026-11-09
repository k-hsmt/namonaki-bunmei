import type {EconomicProductionWorld} from './economic-production-types-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {freezeReview} from './wire-v1.js';
const views=new WeakMap<object,GeneratedBridgeReview>();
/** Neutral algorithm view retains the economic boundary and never enters B's ownership cache. */
export function economicProductionViewInternal(input:EconomicProductionWorld):GeneratedBridgeReview {
 let view=views.get(input);if(!view){const {economicCoupling:_,...world}=input;view=freezeReview({...world,format:'generated-bridge-review' as const,status:'review-only' as const});views.set(input,view);}return view;
}
