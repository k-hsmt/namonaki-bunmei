/**
 * Issue #35 D2-c: small housing parts (architecture-miniature-v1, Human decision H1 on PR #115).
 * Keeps the live roof-part grid and sizes (far 5×4, middle 9×7, near 13×10) and draws each part with only
 * the main features of its birth style:
 *  - near:   roof family outline, deep eaves, roof material colour and joints, wall colour, foundation height
 *  - middle: roof outline reduced to three shapes (peaked / flat / shed), roof and wall colours
 *  - far:    roof and wall colours only
 * Windows, entrances and ornaments are omitted at every size. This is new drawing that no one reviewed
 * in D1: it stays out of the live scene until Human accepts the D2-c images.
 */
import {normalizeSpec,type ArchitectureSpec,type PartialSpec,type Use} from './vocab-v1.js';
import {architectureColors,shade,type RectTarget} from './draw-v1.js';

export type PartDepth='far'|'middle'|'near';
export const MINIATURE_ID='architecture-miniature-v1';
/** Same footprint as the live drawResidentialRoofs parts. */
export const miniatureSizes:Readonly<Record<PartDepth,readonly [number,number]>>={far:[5,4],middle:[9,7],near:[13,10]};

type Shape='peaked'|'flat'|'shed';
const middleShape=(s:ArchitectureSpec):Shape=>s.roofFamily==='R05'||s.roofFamily==='R06'?'flat':s.roofFamily==='R04'?'shed':'peaked';
const lift:Readonly<Record<string,number>>={F1:0,F2:1,F3:1,F4:1,F5:2,F6:1};

/** x = part centre, y = ground line of the part (as the live roof part's y). Returns the normalized spec. */
export function drawMiniature(g:RectTarget,input:PartialSpec&{readonly use:Use},x:number,y:number,depth:PartDepth):ArchitectureSpec {
 const s=normalizeSpec(input),{p,wall,roof}=architectureColors(s),{dark,light}=shade;
 const R=(a:number,b:number,w:number,h:number,c:string)=>{if(w>0&&h>0)g.rect(Math.round(a),Math.round(b),Math.round(w),Math.round(h),c);};
 const [w,h0]=miniatureSizes[depth],left=x-Math.floor(w/2);
 // D5: a second storey raises the wall (far 2, middle 3, near 4 px) and marks the floor line
 const extra=s.storeys>1?{far:2,middle:3,near:4}[depth]:0,h=h0+extra;
 if(depth==='far'){
  // colour only: wall body and a roof band
  g.part?.('wall');R(left,y-h+2,w,h-2,wall);g.part?.('roof');R(left-1,y-h,w+2,2,roof);
  return s;
 }
 if(depth==='middle'){
  const top=y-h+3;g.part?.('wall');R(left,top,w,h-3,wall);if(extra)R(left,top+extra,w,1,dark(wall,.3));
  const shape=middleShape(s);g.part?.('roof');
  if(shape==='flat'){R(left-1,top-2,w+2,2,roof);}
  else if(shape==='shed'){for(let i=0;i<w+2;i++){const t=top-1-Math.round(3*(w+1-i)/(w+1));R(left-1+i,t,1,top-t,roof);}}
  else{const half=(w+2)/2;for(let i=0;i<w+2;i++){const t=top-Math.max(1,Math.round(4*(1-Math.abs(i+.5-half)/half)));R(left-1+i,t,1,top-t,roof);}}
  g.part?.('opening');R(left+1,y-2,2,2,dark(wall,.4));
  return s;
 }
 // near: outline, eaves, material, foundation
 const base=y-(lift[s.foundation]??0),bodyTop=base-(h-4),o=s.eaves==='deep'?2:1;
 g.part?.('foundation');
 if(s.foundation==='F5'){for(const dx of [1,w-2])R(left+dx,base,1,y-base,dark(p.timber,.25));R(left,base-1,w,1,dark(p.timber,.3));}
 else if(s.foundation==='F2'||s.foundation==='F4'){R(left-(s.foundation==='F4'?2:1),base,w+(s.foundation==='F4'?4:2),y-base,p.stone);}
 else if(s.foundation==='F3'){for(const dx of [2,w-3])R(left+dx,base,1,y-base,dark(p.timber,.2));}
 g.part?.('wall');
 R(left,bodyTop,w,base-bodyTop,wall);
 if(extra)R(left,bodyTop+extra+1,w,1,dark(wall,.3));
 if(s.wall==='plank'||s.wall==='log')for(let i=left+2;i<left+w;i+=3)R(i,bodyTop,1,base-bodyTop,dark(wall,.14));
 if(s.wall==='rubble'||s.wall==='ashlar')R(left,bodyTop+Math.floor((base-bodyTop)/2),w,1,dark(wall,.16));
 const texture=(i:number,d:number,c:string)=>s.roofMaterial==='thatch'?((i*7+d*3)%5===0?light(c,.2):c):s.roofMaterial==='tile'?(i%2?dark(c,.18):c):
  s.roofMaterial==='slate'?(d%2?dark(c,.2):c):s.roofMaterial==='shingle'?(d%2?dark(c,.12):c):c;
 const column=(i:number,t:number,bottom:number)=>{for(let yy=t;yy<bottom;yy++)R(left-o+i,yy,1,1,yy===t?light(roof,.18):texture(i,yy-t,roof));};
 g.part?.('roof');
 const span=w+2*o,pitch=s.pitch==='high'?1:s.pitch==='low'?-1:0;
 switch(s.roofFamily){
  case 'R01':case 'R02':{const H=Math.max(3,(s.roofFamily==='R02'?6:5)+pitch),half=span/2;
   for(let i=0;i<span;i++)column(i,bodyTop-Math.max(1,Math.round(H*(1-Math.abs(i+.5-half)/half))),bodyTop+1);break;}
  case 'R03':{const H=Math.max(2,3+pitch);for(let i=0;i<span;i++)column(i,bodyTop-Math.min(H,1+Math.min(i,span-1-i)),bodyTop+1);break;}
  case 'R04':{const H=Math.max(2,4+pitch);for(let i=0;i<span;i++)column(i,bodyTop-1-Math.round(H*(span-1-i)/(span-1)),bodyTop+1);break;}
  case 'R05':{for(let i=0;i<span;i++)column(i,bodyTop-2,bodyTop+1);R(left-o,bodyTop-3,2,1,light(roof,.1));R(left-o+span-2,bodyTop-3,2,1,light(roof,.1));break;}
  case 'R06':{const a=Math.ceil(span/2);for(let i=0;i<span;i++)column(i,bodyTop-(i<a?4:2),bodyTop+1);break;}
  case 'R08':{const main=Math.ceil(span*.65),half=main/2;
   for(let i=0;i<main;i++)column(i,bodyTop-Math.max(1,Math.round(4*(1-Math.abs(i+.5-half)/half))),bodyTop+1);
   for(let i=main;i<span;i++)column(i,bodyTop-1-Math.round(2*(span-1-i)/Math.max(1,span-1-main)),bodyTop+1);break;}
 }
 if(s.eaves==='deep')R(left,bodyTop+1,w,1,dark(wall,.35));
 g.part?.('opening');
 R(left+2,base-3,2,3,dark(wall,.45));
 return s;
}
