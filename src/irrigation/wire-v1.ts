/** Stable base binding; integrity is checked together with source and replay validation. */
import {assertJsonWire} from '../story/generated-state-review.js';
export function freezeReview<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freezeReview);Object.freeze(value);}return value;}
export function canonicalWire(value:unknown):string {assertJsonWire(value);return JSON.stringify(value,(_key,v:unknown)=>v&&!Array.isArray(v)&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);}
const hashes=new WeakMap<object,string>();
export async function reviewBaseHash(base:object):Promise<string>{let hash=hashes.get(base);if(!hash){hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalWire(base))))].map(n=>n.toString(16).padStart(2,'0')).join('');if(Object.isFrozen(base))hashes.set(base,hash);}return hash;}
