/** Dedicated D4 recorded wire. A persistent land marker survives ordinary shape adapters. */
import {captureGeneratedLandFoundations} from '../story/generated-land-foundations-review.js';
import {productionPlacementPolicy} from '../story/world-save.js';
import {economicTuplesInternal} from '../irrigation/economic-tuples-internal.js';
import {terrainChangeTrialBoundary} from '../story/trial-boundary.js';
import {knownTerrainTrialWorldInternal} from './terrain-trial-owned-internal.js';
import type {TerrainTrialWorld} from './terrain-trial-types-v1.js';
export const terrainTrialMaxBytes=16*1024*1024,terrainTrialStoredMaxBytes=4*1024*1024;
export function terrainTrialWireInternal(world:TerrainTrialWorld){
 knownTerrainTrialWorldInternal(world);const r=world.review,e=world.environment!,last=e.checkpoints.length-1,h=world.terrainHistory;
 return {format:'terrain-change-review-save-v1' as const,schemaVersion:1 as const,status:'review-only' as const,
  world:{format:'terrain-change-recorded-world-v1' as const,schemaVersion:1 as const,initialTerrain:{schemaVersion:1 as const,mode:'generated' as const,record:r.terrain,hydrology:r.bridgeReview!.hydrology,plans:r.plans},progressionPolicy:productionPlacementPolicy,rendererId:'terrain-scene-review-v1' as const,
   landHistory:{...captureGeneratedLandFoundations(r),terrainChangeBoundary:terrainChangeTrialBoundary},state:r.state,vegetation:world.vegetation,environment:{...e,current:e.checkpoints[last]?.year===e.current.year?{format:'terrain-environment-checkpoint-ref-v1',index:last}:e.current},irrigation:world.irrigation,...(world.environmentAppearance?{environmentAppearance:world.environmentAppearance}:{}),economicCoupling:{...world.economicCoupling,storageEncoding:'economic-production-tuples-v1',...economicTuplesInternal(world.economicCoupling)}},
  terrainHistory:{format:h.format,schemaVersion:h.schemaVersion,status:h.status,ruleId:h.ruleId,baseHash:h.baseHash,confirmedThrough:h.confirmedThrough,events:h.events},terrainChanges:world.terrainChanges};
}
export type TerrainTrialSave=ReturnType<typeof terrainTrialWireInternal>&{readonly payloadHash:string};
