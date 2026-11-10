/** Canonical D4 values. No story engine, producer, RNG, storage or DOM imports. */
export function terrainRevisionCanonical(value:unknown):string {
 const ancestors=new Set<object>();
 const encode=(v:unknown):string=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  if(!v||typeof v!=='object'||ancestors.has(v)||Object.getOwnPropertySymbols(v).length)throw Error('Invalid terrain revision JSON');
  const keys=Object.keys(v),names=Object.getOwnPropertyNames(v),array=Array.isArray(v);
  if(array?(keys.length!==v.length||names.length!==v.length+1||keys.some((k,i)=>k!==String(i))):(![Object.prototype,null].includes(Object.getPrototypeOf(v))||names.length!==keys.length))throw Error('Invalid terrain revision object');
  ancestors.add(v);const fields=keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k)!;if(!('value'in d))throw Error('Terrain revision accessor');return [k,encode(d.value)] as const;});ancestors.delete(v);
  return array?'['+fields.map(([,x])=>x).join(',')+']':'{'+fields.sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+x).join(',')+'}';
 };return encode(value);
}
export async function terrainRevisionHash(value:unknown):Promise<string>{const wire=terrainRevisionCanonical(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(wire)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
