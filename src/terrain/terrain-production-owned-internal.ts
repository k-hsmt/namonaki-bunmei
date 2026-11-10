/** Production roots and packets never acquire trial or C3 ownership. */
import type {TerrainProductionWorld} from './terrain-production-types-v1.js';
import {terrainEvolutionProviderInternal,terrainEvolutionViewInternal} from './terrain-evolution-view-internal.js';
import {bindTerrainReviewInternal} from '../story/terrain-review-binding-internal.js';
import {terrainProductionBoundary} from '../story/trial-boundary.js';
import {freezeReview} from '../irrigation/wire-v1.js';
const worlds=new WeakSet<object>(),packets=new WeakMap<object,TerrainProductionWorld>();
export function ownTerrainProductionWorldInternal(world:TerrainProductionWorld):TerrainProductionWorld {
 const t=world.terrainDevelopment;
 if(world.format!=='terrain-production-world-v1'||world.status!=='production'||world.review.terrainPolicyBoundary!==terrainProductionBoundary||world.review.terrainChangeBoundary!==undefined||world.review.economicPolicyBoundary!==undefined||world.review.trialBoundary!==undefined||Object.hasOwn(world,'terrainChanges')||t.ruleId!==terrainProductionBoundary||t.policy!=='cut'||t.runtimeRules.geometry!=='terrain-cut-v1'||t.economicRule.id!=='small-cut-no-direct-economic-effect-v1'||t.economicRule.additionalWorkBp!==0||t.economicRule.directYieldBp!==0)throw Error('Invalid terrain production ownership boundary');bindTerrainReviewInternal(world.review,terrainEvolutionProviderInternal(world));freezeReview(world);worlds.add(world);return world;
}
export function knownTerrainProductionWorldInternal(world:TerrainProductionWorld):void {if(!worlds.has(world))throw Error('Use an owned or validated terrain production world');}
export function terrainProductionViewInternal(world:TerrainProductionWorld){knownTerrainProductionWorldInternal(world);return terrainEvolutionViewInternal(world);}
export function ownTerrainProductionPacketInternal<T extends object>(packet:T,world:TerrainProductionWorld):T {knownTerrainProductionWorldInternal(world);freezeReview(packet);packets.set(packet,world);return packet;}
export function terrainProductionPacketWorldInternal(packet:unknown):TerrainProductionWorld|undefined{return packet&&typeof packet==='object'?packets.get(packet):undefined;}
