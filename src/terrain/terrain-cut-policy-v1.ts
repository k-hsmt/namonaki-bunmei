/** Independent trial entry; the production writer uses the private selector directly. */
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import type {TerrainHistory} from './terrain-revision-v1.js';
import {selectNaturalTerrainCutInternal} from './terrain-cut-selection-internal.js';
export const decideNaturalTerrainCut=(review:GeneratedFacilityReview,history:TerrainHistory,year:number)=>selectNaturalTerrainCutInternal(review,history,year,'terrain-cut-review-v2');
