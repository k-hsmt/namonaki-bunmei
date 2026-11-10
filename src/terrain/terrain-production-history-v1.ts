/** Native v8 proof. Only this envelope can register production terrain ownership. */
import {assertJsonWire,wireObject} from '../story/generated-state-review.js';
import {freezeReview} from '../irrigation/wire-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {terrainProductionMaxBytes} from './terrain-production-contract-v1.js';
import type {TerrainProductionSave} from './terrain-production-wire-v1.js';
import {ownTerrainProductionWorldInternal,ownTerrainProductionPacketInternal,terrainProductionPacketWorldInternal} from './terrain-production-owned-internal.js';
import type {TerrainProductionWorld} from './terrain-production-types-v1.js';
import {terrainProductionProfile} from './terrain-profile-internal.js';
import {verifyTerrainEvolutionInternal} from './terrain-evolution-proof-internal.js';
export async function validateTerrainProductionSave(raw:unknown):Promise<TerrainProductionSave>{
 if(terrainProductionPacketWorldInternal(raw))return raw as TerrainProductionSave;
 assertJsonWire(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>terrainProductionMaxBytes)throw Error('Terrain production exceeds 16MiB');const packet=freezeReview(structuredClone(raw)),d=wireObject(packet,['format','version','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state','vegetation','environment','irrigation','economicCoupling','terrainHistory','terrainDevelopment','payloadHash'],['environmentAppearance']),{payloadHash,version,terrainHistory,terrainDevelopment,...worldParts}=d;
 if(d.format!=='namonaki-world-save'||version!==8||d.schemaVersion!==1||typeof payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(payloadHash)||await terrainRevisionHash({...worldParts,version,terrainHistory,terrainDevelopment})!==payloadHash)throw Error('Invalid terrain production commitment');
 const world=await verifyTerrainEvolutionInternal(worldParts,terrainHistory,terrainDevelopment,terrainProductionProfile),owned=ownTerrainProductionWorldInternal(world as TerrainProductionWorld);return ownTerrainProductionPacketInternal(packet as TerrainProductionSave,owned);
}
export function restoreTerrainProductionSave(packet:TerrainProductionSave):TerrainProductionWorld{const world=terrainProductionPacketWorldInternal(packet);if(!world)throw Error('Use a validated terrain production packet');return world;}
