/** An algorithm projection is not an owned trial or production world. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {bindTerrainReviewInternal,type TerrainReviewProvider} from '../story/terrain-review-binding-internal.js';
import {freezeReview} from '../irrigation/wire-v1.js';
import {resolveTerrainAtYear,terrainHistoryThrough} from './terrain-revision-v1.js';
import type {TerrainEvolutionWorld} from './terrain-evolution-types-internal.js';
const views=new WeakMap<object,GeneratedBridgeReview>();
export function terrainEvolutionProviderInternal(world:Pick<TerrainEvolutionWorld,'review'|'terrainHistory'>):TerrainReviewProvider {
 const horizon=Math.max(world.terrainHistory.confirmedThrough,world.review.state.year),history=terrainHistoryThrough(world.terrainHistory,horizon);
 return (year,site)=>site==='hill-side'?resolveTerrainAtYear(history,year):history.initial;
}
export function terrainEvolutionViewInternal(world:TerrainEvolutionWorld):GeneratedBridgeReview {
 let view=views.get(world);if(!view){const {economicCoupling:_,terrainHistory:__,terrainChanges:___,terrainDevelopment:____,...base}=world;view=freezeReview({...base,format:'generated-bridge-review' as const,status:'review-only' as const});bindTerrainReviewInternal(view.review,terrainEvolutionProviderInternal(world));views.set(world,view);}return view;
}
