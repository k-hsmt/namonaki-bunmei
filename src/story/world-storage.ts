import {ECONOMIC_WORLD_SAVE_KEY,WORLD_SAVE_KEY,IRRIGATED_WORLD_SAVE_KEY,parseWorldSaveAsync,serializeWorldSave,type WorldSave} from './world-save.js';
import {CURRENT_SAVE_KEY,LEGACY_SAVE_KEYS} from './housing-persistence.js';
import {base64,unbase64,bounded} from './compressed-save-draft-review.js';
import {wireObject} from './generated-state-review.js';
const limit=16*1024*1024,format='namonaki-world-save-gzip';
export async function encodeWorldSave(save:WorldSave):Promise<{json:string;plain:string}>{
 const plain=serializeWorldSave(save),source=new TextEncoder().encode(plain);
 if(typeof CompressionStream!=='function')return {json:plain,plain};
 const compressed=await bounded(new Blob([source]).stream().pipeThrough(new CompressionStream('gzip')),limit);
 const json=JSON.stringify({format,version:save.version,schemaVersion:1,mode:save.initialTerrain.mode,encoding:'gzip-base64-v1',uncompressedBytes:source.length,data:base64(compressed)});
 return {json:json.length<plain.length?json:plain,plain};
}
export async function decodeWorldSave(json:string):Promise<WorldSave>{
 if(typeof json!=='string'||new TextEncoder().encode(json).length>limit)throw Error('Stored world exceeds 16MiB');
 const raw:unknown=JSON.parse(json);if(!raw||typeof raw!=='object'||!('format' in raw)||raw.format!==format)return parseWorldSaveAsync(json);
 const d=wireObject(raw,['format','version','schemaVersion','mode','encoding','uncompressedBytes','data']);
 if(![5,6,7].includes(d.version as number)||d.schemaVersion!==1||!['generated','legacy-fixed'].includes(d.mode as string)||d.encoding!=='gzip-base64-v1'||!Number.isSafeInteger(d.uncompressedBytes)||Number(d.uncompressedBytes)<1||Number(d.uncompressedBytes)>limit||typeof DecompressionStream!=='function')throw Error('Unknown compressed world contract');
 const bytes=await bounded(new Blob([new Uint8Array(unbase64(d.data))]).stream().pipeThrough(new DecompressionStream('gzip')),Number(d.uncompressedBytes));
 if(bytes.length!==d.uncompressedBytes)throw Error('World length mismatch');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),inner:unknown=JSON.parse(text);
 if(!inner||typeof inner!=='object'||!('version' in inner)||inner.version!==d.version)throw Error('Mixed world payload');
 const save=await parseWorldSaveAsync(text);if(save.initialTerrain.mode!==d.mode)throw Error('World mode mismatch');return save;
}
export async function findWorldSave(read:(key:string)=>string|null):Promise<WorldSave|null>{
 for(const key of [ECONOMIC_WORLD_SAVE_KEY,IRRIGATED_WORLD_SAVE_KEY,WORLD_SAVE_KEY,CURRENT_SAVE_KEY,...LEGACY_SAVE_KEYS]){const raw=read(key);if(raw!==null)return decodeWorldSave(raw);}return null;
}
export async function storeWorldSave(storage:Pick<Storage,'setItem'>,save:WorldSave):Promise<{status:'saved'}|{status:'not-saved';exportJson:string}>{
 const encoded=await encodeWorldSave(save);try{storage.setItem(save.version===7?ECONOMIC_WORLD_SAVE_KEY:IRRIGATED_WORLD_SAVE_KEY,encoded.json);return {status:'saved'};}catch{return {status:'not-saved',exportJson:encoded.plain};}
}
