/** Review-only codec. No browser storage, normal-world import or trial promotion. */
import {base64,unbase64,bounded} from '../story/compressed-save-draft-review.js';
import {wireObject} from '../story/generated-state-review.js';
import {freezeReview} from '../irrigation/wire-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {terrainTrialWireInternal,terrainTrialMaxBytes,terrainTrialStoredMaxBytes,type TerrainTrialSave} from './terrain-trial-wire-v1.js';
import {knownTerrainTrialWorldInternal,ownTerrainTrialPacketInternal} from './terrain-trial-owned-internal.js';
import {validateTerrainTrialSave,restoreTerrainTrialSave} from './terrain-trial-history-v1.js';
import type {TerrainTrialWorld} from './terrain-trial-types-v1.js';
export async function prepareTerrainTrialSave(world:TerrainTrialWorld):Promise<TerrainTrialSave>{
 knownTerrainTrialWorldInternal(world);const payload=freezeReview(terrainTrialWireInternal(world)),packet={...payload,payloadHash:await terrainRevisionHash(payload)};if(new TextEncoder().encode(JSON.stringify(packet)).length>terrainTrialMaxBytes)throw Error('Terrain trial exceeds 16MiB');return ownTerrainTrialPacketInternal(packet,world);
}
export async function encodeTerrainTrial(world:TerrainTrialWorld):Promise<string>{
 const plain=JSON.stringify(await prepareTerrainTrialSave(world)),source=new TextEncoder().encode(plain);if(typeof CompressionStream!=='function')return plain;
 const bytes=await bounded(new Blob([source]).stream().pipeThrough(new CompressionStream('gzip')),terrainTrialMaxBytes),compressed=JSON.stringify({format:'terrain-change-review-gzip-v1',schemaVersion:1,status:'review-only',encoding:'gzip-base64-v1',uncompressedBytes:source.length,data:base64(bytes)}),text=compressed.length<plain.length?compressed:plain;if(new TextEncoder().encode(text).length>terrainTrialStoredMaxBytes)throw Error('Compressed terrain trial exceeds 4MiB');return text;
}
export async function decodeTerrainTrial(text:string):Promise<TerrainTrialWorld>{
 if(typeof text!=='string'||new TextEncoder().encode(text).length>terrainTrialMaxBytes)throw Error('Stored terrain trial exceeds 16MiB');let raw:unknown=JSON.parse(text);
 if(raw&&typeof raw==='object'&&'format'in raw&&raw.format==='terrain-change-review-gzip-v1'){
  if(new TextEncoder().encode(text).length>terrainTrialStoredMaxBytes)throw Error('Compressed terrain trial exceeds 4MiB');const d=wireObject(raw,['format','schemaVersion','status','encoding','uncompressedBytes','data']);if(d.schemaVersion!==1||d.status!=='review-only'||d.encoding!=='gzip-base64-v1'||!Number.isSafeInteger(d.uncompressedBytes)||Number(d.uncompressedBytes)<1||Number(d.uncompressedBytes)>terrainTrialMaxBytes||typeof DecompressionStream!=='function')throw Error('Unknown compressed terrain trial');
  const bytes=await bounded(new Blob([new Uint8Array(unbase64(d.data))]).stream().pipeThrough(new DecompressionStream('gzip')),Number(d.uncompressedBytes));if(bytes.length!==d.uncompressedBytes)throw Error('Terrain compressed length mismatch');raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }
 return restoreTerrainTrialSave(await validateTerrainTrialSave(raw));
}
