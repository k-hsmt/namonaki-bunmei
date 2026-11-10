/** Complete v8 preparation; gzip/import and browser keys use the normal WorldSave envelope. */
import {freezeReview} from '../irrigation/wire-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {terrainProductionWireInternal,type TerrainProductionSave} from './terrain-production-wire-v1.js';
import {terrainProductionMaxBytes} from './terrain-production-contract-v1.js';
import {knownTerrainProductionWorldInternal,ownTerrainProductionPacketInternal} from './terrain-production-owned-internal.js';
import type {TerrainProductionWorld} from './terrain-production-types-v1.js';
export async function prepareTerrainProductionSave(world:TerrainProductionWorld):Promise<TerrainProductionSave>{
 knownTerrainProductionWorldInternal(world);const payload=freezeReview(terrainProductionWireInternal(world)),packet={...payload,payloadHash:await terrainRevisionHash(payload)};if(new TextEncoder().encode(JSON.stringify(packet)).length>terrainProductionMaxBytes)throw Error('Terrain production exceeds 16MiB');return ownTerrainProductionPacketInternal(packet,world);
}
