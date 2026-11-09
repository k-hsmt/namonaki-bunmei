/** v7 is one complete world plus compact economic evidence. No trial packet wrapping. */
import {captureGeneratedLandFoundations} from '../story/generated-land-foundations-review.js';
import {productionPlacementPolicy} from '../story/world-save.js';
import {economicTuplesInternal} from './economic-tuples-internal.js';
import {knownEconomicProductionWorldInternal} from './economic-production-owned-internal.js';
import type {EconomicProductionWorld} from './economic-production-types-v1.js';
export const economicProductionMaxBytes=16*1024*1024;
export function economicProductionWireInternal(world:EconomicProductionWorld){
 knownEconomicProductionWorldInternal(world);const r=world.review,e=world.environment!,last=e.checkpoints.length-1;
 return {format:'namonaki-world-save' as const,version:7 as const,schemaVersion:1 as const,initialTerrain:{schemaVersion:1 as const,mode:'generated' as const,record:r.terrain,hydrology:r.bridgeReview!.hydrology,plans:r.plans},progressionPolicy:productionPlacementPolicy,rendererId:'generated-scene-v6' as const,landHistory:captureGeneratedLandFoundations(r),state:r.state,vegetation:world.vegetation,environment:{...e,current:e.checkpoints[last]?.year===e.current.year?{format:'economic-environment-checkpoint-ref-v1',index:last}:e.current},irrigation:world.irrigation,...(world.environmentAppearance?{environmentAppearance:world.environmentAppearance}:{}),economicCoupling:{...world.economicCoupling,storageEncoding:'economic-production-tuples-v1',...economicTuplesInternal(world.economicCoupling)}};
}
export type EconomicProductionSave=ReturnType<typeof economicProductionWireInternal>&{readonly payloadHash:string};
