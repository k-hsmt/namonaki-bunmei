/** Independent trial envelope and ownership. The native proof is private and profile-bound. */
import {assertJsonWire,wireObject} from '../story/generated-state-review.js';
import {freezeReview} from '../irrigation/wire-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {terrainTrialMaxBytes,type TerrainTrialSave} from './terrain-trial-wire-v1.js';
import {ownTerrainTrialWorldInternal,ownTerrainTrialPacketInternal,terrainTrialPacketWorldInternal} from './terrain-trial-owned-internal.js';
import type {TerrainTrialWorld} from './terrain-trial-types-v1.js';
import {terrainTrialProfile} from './terrain-profile-internal.js';
import {verifyTerrainEvolutionInternal} from './terrain-evolution-proof-internal.js';
export async function validateTerrainTrialSave(raw:unknown):Promise<TerrainTrialSave>{
 if(terrainTrialPacketWorldInternal(raw))return raw as TerrainTrialSave;
 assertJsonWire(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>terrainTrialMaxBytes)throw Error('Terrain trial exceeds 16MiB');const packet=freezeReview(structuredClone(raw)),d=wireObject(packet,['format','schemaVersion','status','world','terrainHistory','terrainChanges','payloadHash']),{payloadHash,...payload}=d;
 if(d.format!=='terrain-change-review-save-v1'||d.schemaVersion!==1||d.status!=='review-only'||typeof payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(payloadHash)||await terrainRevisionHash(payload)!==payloadHash)throw Error('Invalid terrain trial commitment');
 const world=await verifyTerrainEvolutionInternal(d.world,d.terrainHistory,d.terrainChanges,terrainTrialProfile),owned=ownTerrainTrialWorldInternal(world as TerrainTrialWorld);return ownTerrainTrialPacketInternal(packet as TerrainTrialSave,owned);
}
export function restoreTerrainTrialSave(packet:TerrainTrialSave):TerrainTrialWorld{const world=terrainTrialPacketWorldInternal(packet);if(!world)throw Error('Use a validated terrain trial packet');return world;}
