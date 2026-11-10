/** Flat normal v8 world. No trial packet, origin dialect or ownership is promoted. */
import {captureGeneratedLandFoundations} from '../story/generated-land-foundations-review.js';
import {productionPlacementPolicy} from '../story/world-save.js';
import {terrainProductionBoundary} from '../story/trial-boundary.js';
import {economicTuplesInternal} from '../irrigation/economic-tuples-internal.js';
import {knownTerrainProductionWorldInternal} from './terrain-production-owned-internal.js';
import type {TerrainProductionWorld} from './terrain-production-types-v1.js';
export function terrainProductionWireInternal(world:TerrainProductionWorld){
 knownTerrainProductionWorldInternal(world);const r=world.review,e=world.environment!,last=e.checkpoints.length-1,h=world.terrainHistory;
 return {format:'namonaki-world-save' as const,version:8 as const,schemaVersion:1 as const,initialTerrain:{schemaVersion:1 as const,mode:'generated' as const,record:r.terrain,hydrology:r.bridgeReview!.hydrology,plans:r.plans},progressionPolicy:productionPlacementPolicy,rendererId:'generated-scene-v7' as const,landHistory:{...captureGeneratedLandFoundations(r),terrainPolicyBoundary:terrainProductionBoundary},state:r.state,vegetation:world.vegetation,environment:{...e,current:e.checkpoints[last]?.year===e.current.year?{format:'terrain-production-environment-checkpoint-ref-v1',index:last}:e.current},irrigation:world.irrigation,...(world.environmentAppearance?{environmentAppearance:world.environmentAppearance}:{}),economicCoupling:{...world.economicCoupling,storageEncoding:'economic-production-tuples-v1',...economicTuplesInternal(world.economicCoupling)},terrainHistory:{format:'terrain-history-v1' as const,schemaVersion:1 as const,status:'recorded' as const,ruleId:h.ruleId,baseHash:h.baseHash,confirmedThrough:h.confirmedThrough,events:h.events},terrainDevelopment:world.terrainDevelopment};
}
export type TerrainProductionSave=ReturnType<typeof terrainProductionWireInternal>&{readonly payloadHash:string};
