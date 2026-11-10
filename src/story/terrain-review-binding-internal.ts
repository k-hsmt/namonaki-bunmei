/** Private phase projection for D4. The saved review always retains its initial record. */
import {assertResolvedTerrain,type TerrainPhysicalSource} from '../terrain/terrain-revision-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {GeneratedFacilityReview} from './generated-facility-review.js';
import {terrainChangeTrialBoundary,terrainProductionBoundary} from './trial-boundary.js';
export type TerrainReviewProvider=(year:number,site:RecordSite)=>TerrainPhysicalSource;
const bindings=new WeakMap<object,TerrainReviewProvider>();
export function bindTerrainReviewInternal(review:GeneratedFacilityReview,provider:TerrainReviewProvider):void {
 if(!((review.terrainChangeBoundary===terrainChangeTrialBoundary&&review.terrainPolicyBoundary===undefined)||(review.terrainPolicyBoundary===terrainProductionBoundary&&review.terrainChangeBoundary===undefined))||review.trialBoundary!==undefined||review.economicPolicyBoundary!==undefined)throw Error('Missing D4 terrain review boundary');bindings.set(review,provider);
}
export function terrainForReviewAtInternal(review:GeneratedFacilityReview,year:number,site:RecordSite):TerrainPhysicalSource {
 if(review.terrainChangeBoundary===undefined&&review.terrainPolicyBoundary===undefined)return review.terrain;
 if(!((review.terrainChangeBoundary===terrainChangeTrialBoundary&&review.terrainPolicyBoundary===undefined)||(review.terrainPolicyBoundary===terrainProductionBoundary&&review.terrainChangeBoundary===undefined)))throw Error('Unknown terrain review boundary');const provider=bindings.get(review);if(!provider)throw Error('Missing terrain review binding');
 const terrain=provider(year,site);if(terrain.format==='resolved-terrain-at-year')assertResolvedTerrain(terrain,year,review.terrain);else if(terrain!==review.terrain)throw Error('Terrain review source mismatch');
 if(site!=='hill-side'&&terrain!==review.terrain)throw Error('Unchanged water sites must retain initial physics identity');return terrain;
}
