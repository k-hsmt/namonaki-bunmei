import type {TerrainTrialWorld} from './terrain-trial-types-v1.js';
import {terrainChangeTrialBoundary} from '../story/trial-boundary.js';
import {terrainEvolutionProviderInternal,terrainEvolutionViewInternal} from './terrain-evolution-view-internal.js';
import {bindTerrainReviewInternal} from '../story/terrain-review-binding-internal.js';
import {freezeReview} from '../irrigation/wire-v1.js';
const worlds=new WeakSet<object>();
export const terrainTrialProviderInternal=terrainEvolutionProviderInternal;
export function ownTerrainTrialWorldInternal(world:TerrainTrialWorld):TerrainTrialWorld {
 if(world.format!=='terrain-change-review-world-v1'||world.status!=='review-only'||world.review.terrainChangeBoundary!==terrainChangeTrialBoundary||world.review.terrainPolicyBoundary!==undefined||world.review.trialBoundary!==undefined||world.review.economicPolicyBoundary!==undefined||Object.hasOwn(world,'terrainDevelopment'))throw Error('Invalid terrain trial ownership boundary');bindTerrainReviewInternal(world.review,terrainTrialProviderInternal(world));freezeReview(world);worlds.add(world);return world;
}
export function knownTerrainTrialWorldInternal(world:TerrainTrialWorld):void {if(!worlds.has(world))throw Error('Use an owned or validated terrain trial');}
export function terrainTrialViewInternal(world:TerrainTrialWorld){return terrainEvolutionViewInternal(world);}
const packets=new WeakMap<object,TerrainTrialWorld>();
export function ownTerrainTrialPacketInternal<T extends object>(packet:T,world:TerrainTrialWorld):T {knownTerrainTrialWorldInternal(world);freezeReview(packet);packets.set(packet,world);return packet;}
export function terrainTrialPacketWorldInternal(packet:unknown):TerrainTrialWorld|undefined{return packet&&typeof packet==='object'?packets.get(packet):undefined;}
