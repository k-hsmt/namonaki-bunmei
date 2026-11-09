/** Independent C2 export/import only. Never writes browser production storage. */
import {base64,unbase64,bounded} from '../story/compressed-save-draft-review.js';
import {wireObject} from '../story/generated-state-review.js';
import {validateCoupledReview} from './coupled-history-v1.js';
import {coupledWire,coupledMaxBytes as limit} from './coupled-wire-v1.js';
import type {IrrigationCoupledReview} from './coupled-types-v1.js';
import {reviewBaseHash} from './wire-v1.js';
export async function serializeCoupledReview(raw:unknown):Promise<string>{const t=await validateCoupledReview(raw),payload=coupledWire(t),plain=JSON.stringify({...payload,payloadHash:await reviewBaseHash(payload)});if(new TextEncoder().encode(plain).length>limit)throw Error('Coupled review exceeds 16MiB');return plain;}
export async function encodeCoupledReview(raw:unknown):Promise<string>{const plain=await serializeCoupledReview(raw),source=new TextEncoder().encode(plain);if(typeof CompressionStream!=='function')return plain;const bytes=await bounded(new Blob([source]).stream().pipeThrough(new CompressionStream('gzip')),limit),text=JSON.stringify({format:'irrigation-coupled-review-gzip-v1',schemaVersion:1,status:'review-only',encoding:'gzip-base64-v1',uncompressedBytes:source.length,data:base64(bytes)});return text.length<plain.length?text:plain;}
export async function decodeCoupledReview(text:string):Promise<IrrigationCoupledReview>{
 if(typeof text!=='string'||new TextEncoder().encode(text).length>limit)throw Error('Stored coupled review exceeds 16MiB');let raw:unknown=JSON.parse(text);
 if(raw&&typeof raw==='object'&&'format'in raw&&raw.format==='irrigation-coupled-review-gzip-v1'){
  const d=wireObject(raw,['format','schemaVersion','status','encoding','uncompressedBytes','data']);if(d.schemaVersion!==1||d.status!=='review-only'||d.encoding!=='gzip-base64-v1'||!Number.isSafeInteger(d.uncompressedBytes)||Number(d.uncompressedBytes)<1||Number(d.uncompressedBytes)>limit||typeof DecompressionStream!=='function')throw Error('Unknown compressed C2 contract');
  const bytes=await bounded(new Blob([new Uint8Array(unbase64(d.data))]).stream().pipeThrough(new DecompressionStream('gzip')),Number(d.uncompressedBytes));if(bytes.length!==d.uncompressedBytes)throw Error('C2 compressed length mismatch');raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }
 return validateCoupledReview(raw);
}
