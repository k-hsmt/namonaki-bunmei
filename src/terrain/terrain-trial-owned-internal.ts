import type {TerrainTrialWorld} from './terrain-trial-types-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {bindTerrainReviewInternal,type TerrainReviewProvider} from '../story/terrain-review-binding-internal.js';
import {resolveTerrainAtYear,terrainHistoryThrough} from './terrain-revision-v1.js';
import {freezeReview} from '../irrigation/wire-v1.js';
const worlds=new WeakSet<object>(),views=new WeakMap<object,GeneratedBridgeReview>();
export function terrainTrialProviderInternal(world:TerrainTrialWorld):TerrainReviewProvider {
 const horizon=Math.max(world.terrainHistory.confirmedThrough,world.review.state.year),history=terrainHistoryThrough(world.terrainHistory,horizon);
 return (year,site)=>site==='hill-side'?resolveTerrainAtYear(history,year):history.initial;
}
export function ownTerrainTrialWorldInternal(world:TerrainTrialWorld):TerrainTrialWorld {bindTerrainReviewInternal(world.review,terrainTrialProviderInternal(world));freezeReview(world);worlds.add(world);return world;}
export function knownTerrainTrialWorldInternal(world:TerrainTrialWorld):void {if(!worlds.has(world))throw Error('Use an owned or validated terrain trial');}
export function terrainTrialViewInternal(world:TerrainTrialWorld):GeneratedBridgeReview {
 let view=views.get(world);if(!view){const {economicCoupling:_,terrainHistory:__,terrainChanges:___,...base}=world;view=freezeReview({...base,format:'generated-bridge-review' as const,status:'review-only' as const});bindTerrainReviewInternal(view.review,terrainTrialProviderInternal(world));views.set(world,view);}return view;
}
const packets=new WeakMap<object,TerrainTrialWorld>();
export function ownTerrainTrialPacketInternal<T extends object>(packet:T,world:TerrainTrialWorld):T {knownTerrainTrialWorldInternal(world);freezeReview(packet);packets.set(packet,world);return packet;}
export function terrainTrialPacketWorldInternal(packet:unknown):TerrainTrialWorld|undefined{return packet&&typeof packet==='object'?packets.get(packet):undefined;}
