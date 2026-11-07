/** Frozen D0 A.6 length-prefixed UTF-8 FNV-1a and unsigned integer mix. */
export function terrainHash(parts:readonly (string|number)[]):number {
 let h=2166136261;
 const byte=(b:number)=>{h=Math.imul(h^b,16777619);};
 for(const part of parts){
  const data=new TextEncoder().encode(String(part));
  for(let n=0;n<4;n++)byte((data.length>>>(n*8))&255);
  for(const b of data)byte(b);
 }
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
 h=Math.imul(h,0x846ca68b);h^=h>>>16;return h>>>0;
}

const coordinateBytes=Array.from({length:321},(_,n)=>new TextEncoder().encode(String(n)));
/** The same frozen hash, with an unfinalized constant prefix shared by one grid
 * search. Coordinates use their original decimal UTF-8 bytes. No new namespace,
 * mixing rule or random stream is introduced.
 */
export function terrainCoordinateHasher(prefix:readonly (string|number)[]):(x:number,y:number)=>number {
 const saved=prefix.map(String),encoder=new TextEncoder();let initial=2166136261;
 for(const part of saved){const bytes=encoder.encode(part);
  for(let n=0;n<4;n++)initial=Math.imul(initial^((bytes.length>>>(n*8))&255),16777619);
  for(const b of bytes)initial=Math.imul(initial^b,16777619);
 }
 const append=(h:number,bytes:Uint8Array)=>{
  for(let n=0;n<4;n++)h=Math.imul(h^((bytes.length>>>(n*8))&255),16777619);
  for(const b of bytes)h=Math.imul(h^b,16777619);return h;
 };
 return (x,y)=>{
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||x>320||y<0||y>320)return terrainHash([...saved,x,y]);
  let h=append(append(initial,coordinateBytes[x]!),coordinateBytes[y]!);
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
  h=Math.imul(h,0x846ca68b);h^=h>>>16;return h>>>0;
 };
}
