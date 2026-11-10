/** Stable base binding; integrity is checked together with source and replay validation. */
import {assertJsonWire} from '../story/generated-state-review.js';
const frozenValues=new WeakSet<object>();
/** Reuse only graphs whose children were recursively frozen here, never a shallow-frozen input. */
export function freezeReview<T>(value:T):T {
 if(value&&typeof value==='object'&&!frozenValues.has(value)){
  let reusable=true;
  for(const key of Reflect.ownKeys(value)){
   const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
   const child='value'in descriptor?descriptor.value:Reflect.get(value,key);
   freezeReview(child);
   if(!('value'in descriptor)||child&&typeof child==='object'&&!frozenValues.has(child))reusable=false;
  }
  Object.freeze(value);if(reusable)frozenValues.add(value);
 }
 return value;
}
/** Trusted writer use only: a newly constructed data record, never an external object.
 * Children still take the full recursive path; the writer already knows its own
 * literal has no accessors. External readers must continue using freezeReview. */
export function freezeReviewRecordInternal<T extends object>(record:T):T {
 Object.values(record).forEach(freezeReview);Object.freeze(record);frozenValues.add(record);return record;
}
/** Private writer fast path for a newly constructed plain-data tree only.
 * Every descendant must be a fresh writer literal/array or already owned here.
 * Unlike external/native freezeReview, this path deliberately has no descriptor
 * inspection. Never call it for an imported object or a live engine state. */
export function freezeReviewWriterDataInternal<T>(value:T):T {
 if(value&&typeof value==='object'&&!frozenValues.has(value)){
  for(const child of Object.values(value))freezeReviewWriterDataInternal(child);
  Object.freeze(value);frozenValues.add(value);
 }
 return value;
}
export function canonicalWire(value:unknown):string {assertJsonWire(value);return JSON.stringify(value,(_key,v:unknown)=>v&&!Array.isArray(v)&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);}
const hashes=new WeakMap<object,string>();
export async function reviewBaseHash(base:object):Promise<string>{let hash=hashes.get(base);if(!hash){hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalWire(base))))].map(n=>n.toString(16).padStart(2,'0')).join('');if(Object.isFrozen(base))hashes.set(base,hash);}return hash;}
