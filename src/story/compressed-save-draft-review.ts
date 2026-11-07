/** Lossless v5 storage proposal; full validation precedes any native write. */
import {generatedDraftMaxBytes} from './generated-save-draft-review.js';
import {wireObject} from './generated-state-review.js';
import {parseReviewSaveDraft,serializeReviewSaveDraft,REVIEW_V5_SAVE_KEY,type ReviewSaveDraft} from './save-draft-dispatch-review.js';
import {CURRENT_SAVE_KEY,LEGACY_SAVE_KEYS} from './housing-persistence.js';
const encoding='gzip-base64-v1',format='namonaki-compressed-save-draft';
function base64(bytes:Uint8Array):string {const parts:string[]=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(parts.join(''));}
function unbase64(value:unknown):Uint8Array {
 if(typeof value!=='string'||value.length>generatedDraftMaxBytes||!value.length||value.length%4||!(/^[A-Za-z0-9+/]*={0,2}$/).test(value))throw Error('Invalid compressed base64');
 const binary=atob(value),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(base64(bytes)!==value)throw Error('Noncanonical base64');return bytes;
}
async function bounded(stream:ReadableStream<Uint8Array>,limit:number):Promise<Uint8Array> {
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
   if(size>limit){try{await reader.cancel();}catch{}throw Error('Expanded save exceeds its size limit');}chunks.push(next.value);
  }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function encodeJson(json:string,mode:'generated'|'legacy-fixed'):Promise<{json:string;encoding:'plain-json'|'gzip-base64-v1'}>{
 const source=new TextEncoder().encode(json);if(source.byteLength>generatedDraftMaxBytes)throw Error('Save exceeds 16MiB');
 if(typeof CompressionStream!=='function')return {json,encoding:'plain-json'};
 const bytes=await bounded(new Blob([source]).stream().pipeThrough(new CompressionStream('gzip')),generatedDraftMaxBytes);
 const encoded=JSON.stringify({format,version:5,schemaVersion:1,status:'review-only',mode,encoding,uncompressedBytes:source.byteLength,data:base64(bytes)});
 // Native localStorage capacity is based on string storage, not UTF-8 byte count.
 return encoded.length<json.length?{json:encoded,encoding}:{json,encoding:'plain-json'};
}
export async function encodeReviewSaveDraft(draft:ReviewSaveDraft):Promise<string>{return (await encodeJson(serializeReviewSaveDraft(draft),draft.initialTerrain.mode)).json;}
export async function decodeReviewSaveDraft(json:string):Promise<ReviewSaveDraft>{
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('Stored save exceeds 16MiB');
 const raw:unknown=JSON.parse(json);
 if(!raw||typeof raw!=='object'||!('format' in raw)||raw.format!==format)return parseReviewSaveDraft(json);
 const d=wireObject(raw,['format','version','schemaVersion','status','mode','encoding','uncompressedBytes','data']);
 if(d.version!==5||d.schemaVersion!==1||d.status!=='review-only'||!['generated','legacy-fixed'].includes(d.mode as string)||d.encoding!==encoding||!Number.isSafeInteger(d.uncompressedBytes)||Number(d.uncompressedBytes)<1||Number(d.uncompressedBytes)>generatedDraftMaxBytes)throw Error('Unknown compressed save contract');
 if(typeof DecompressionStream!=='function')throw Error('Gzip decompression unavailable');
 const source=unbase64(d.data),bytes=await bounded(new Blob([new Uint8Array(source)]).stream().pipeThrough(new DecompressionStream('gzip')),Number(d.uncompressedBytes));
 if(bytes.byteLength!==d.uncompressedBytes)throw Error('Compressed save length mismatch');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),inner:unknown=JSON.parse(text);
 if(!inner||typeof inner!=='object'||!('version' in inner)||inner.version!==5)throw Error('Mixed compressed payload version');
 const draft=parseReviewSaveDraft(text);if(draft.initialTerrain.mode!==d.mode)throw Error('Compressed terrain mode mismatch');return draft;
}
export async function findEncodedReviewSaveDraft(read:(key:string)=>string|null):Promise<{key:string;draft:ReviewSaveDraft}|null>{
 for(const key of [REVIEW_V5_SAVE_KEY,CURRENT_SAVE_KEY,...LEGACY_SAVE_KEYS]){const raw=read(key);if(raw!==null)return {key,draft:await decodeReviewSaveDraft(raw)};}return null;
}
export async function storeEncodedReviewSaveDraft(storage:Pick<Storage,'setItem'>,draft:ReviewSaveDraft):Promise<
 {status:'saved';bytes:number;encoding:'plain-json'|'gzip-base64-v1'}|{status:'not-saved';reason:'quota'|'storage';exportJson:string}>{
 const plain=serializeReviewSaveDraft(draft),encoded=await encodeJson(plain,draft.initialTerrain.mode);
 try{storage.setItem(REVIEW_V5_SAVE_KEY,encoded.json);return {status:'saved',bytes:new TextEncoder().encode(encoded.json).length,encoding:encoded.encoding};}
 catch(error){return {status:'not-saved',reason:error instanceof Error&&error.name==='QuotaExceededError'?'quota':'storage',exportJson:plain};}
}
