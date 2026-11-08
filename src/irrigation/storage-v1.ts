/** Export-only review storage. No production or legacy localStorage keys are written. */
import {base64,unbase64,bounded} from '../story/compressed-save-draft-review.js';
import {wireObject} from '../story/generated-state-review.js';
import {validateIrrigationReview} from './history-v1.js';
import {irrigationHistoryLimits as limits,type IrrigationReview} from './review-types-v1.js';
export async function serializeIrrigationReview(trial:IrrigationReview):Promise<string>{const text=JSON.stringify(await validateIrrigationReview(trial));if(new TextEncoder().encode(text).length>limits.maxBytes)throw Error('Irrigation review exceeds 16MiB');return text;}
export async function encodeIrrigationReview(trial:IrrigationReview):Promise<string>{const valid=await validateIrrigationReview(trial),plain=await serializeIrrigationReview(valid),source=new TextEncoder().encode(plain);if(typeof CompressionStream!=='function')return plain;const bytes=await bounded(new Blob([source]).stream().pipeThrough(new CompressionStream('gzip')),limits.maxBytes),json=JSON.stringify({format:'irrigation-review-gzip-v1',schemaVersion:1,status:'review-only',mode:valid.mode,encoding:'gzip-base64-v1',uncompressedBytes:source.length,data:base64(bytes)});return json.length<plain.length?json:plain;}
export async function decodeIrrigationReview(json:string):Promise<IrrigationReview>{
 if(typeof json!=='string'||new TextEncoder().encode(json).length>limits.maxBytes)throw Error('Stored irrigation review exceeds 16MiB');let raw:unknown=JSON.parse(json);
 if(raw&&typeof raw==='object'&&'format' in raw&&raw.format==='irrigation-review-gzip-v1'){
  const d=wireObject(raw,['format','schemaVersion','status','mode','encoding','uncompressedBytes','data']);if(d.schemaVersion!==1||d.status!=='review-only'||!['natural','controlled'].includes(d.mode as string)||d.encoding!=='gzip-base64-v1'||!Number.isSafeInteger(d.uncompressedBytes)||Number(d.uncompressedBytes)<1||Number(d.uncompressedBytes)>limits.maxBytes||typeof DecompressionStream!=='function')throw Error('Unknown compressed irrigation review');
  const bytes=await bounded(new Blob([new Uint8Array(unbase64(d.data))]).stream().pipeThrough(new DecompressionStream('gzip')),Number(d.uncompressedBytes));if(bytes.length!==d.uncompressedBytes)throw Error('Irrigation length mismatch');raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const review=await validateIrrigationReview(raw);if(review.mode!==d.mode)throw Error('Mixed irrigation modes');return review;
 }
 return validateIrrigationReview(raw);
}
