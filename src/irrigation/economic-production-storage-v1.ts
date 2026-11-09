import {economicProductionWireInternal,economicProductionMaxBytes,type EconomicProductionSave} from './economic-production-wire-v1.js';
import {validateEconomicProductionSave} from './economic-production-history-v1.js';
import {knownEconomicProductionWorldInternal,ownEconomicProductionPacketInternal} from './economic-production-owned-internal.js';
import {reviewBaseHash,freezeReview} from './wire-v1.js';
import type {EconomicProductionWorld} from './economic-production-types-v1.js';
/** Complete the immutable packet before handing it to the shared envelope/storage writer. */
export async function prepareEconomicProductionSave(world:EconomicProductionWorld):Promise<EconomicProductionSave>{
 knownEconomicProductionWorldInternal(world);const payload=freezeReview(economicProductionWireInternal(world)),payloadHash=await reviewBaseHash(payload),packet={...payload,payloadHash};
 if(new TextEncoder().encode(JSON.stringify(packet)).length>economicProductionMaxBytes)throw Error('Economic world exceeds 16MiB');return ownEconomicProductionPacketInternal(packet,world);
}
export async function parseEconomicProductionSave(text:string):Promise<EconomicProductionSave>{if(typeof text!=='string'||new TextEncoder().encode(text).length>economicProductionMaxBytes)throw Error('Economic world exceeds 16MiB');return validateEconomicProductionSave(JSON.parse(text));}
