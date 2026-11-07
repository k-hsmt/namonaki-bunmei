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
