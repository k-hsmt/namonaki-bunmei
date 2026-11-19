/**
 * Issue #38 D1a PROTOTYPE: fauna silhouettes and short motions as integer rectangles (ruleId fauna-sprites-v1).
 *
 * An independent drawing for the Human comparison of shape, scale and motion (D0 §9, §12 D1a). Nothing in the live
 * game reads this module: no world, habitat, year, save or history is connected (D0 §13: no live connection before
 * the species sprites are accepted). Pure: no RNG, no clock, no canvas. The same (kind, size, pose, frame) always
 * gives the same rectangles.
 *
 * Local coordinates face right. The lowest row of a standing animal is y=0 (its feet, like the person's feet in
 * scene/motion-frame.ts); y grows downward, so the body is at negative y. A floating bird's y=0 is the water surface
 * row it sits on. A flying bird keeps its body at y=-2, so that its lowest wing tip is never below y=0.
 */
export const FAUNA_SPRITES_RULE_ID='fauna-sprites-v1' as const;

export const FAUNA_KINDS=['deer','horse','bison','hare','fox','sparrow','duck','heron','crow','gull'] as const;
export type FaunaKind=typeof FAUNA_KINDS[number];
/** D0 §6 groups: silhouettes and (later) habitat rules. Not a livestock class. */
export type FaunaGroup='large-herbivore'|'small-ground'|'small-bird'|'water-bird'|'flying-bird';
export const FAUNA_GROUP:Readonly<Record<FaunaKind,FaunaGroup>>=Object.freeze({
 deer:'large-herbivore',horse:'large-herbivore',bison:'large-herbivore',hare:'small-ground',fox:'small-ground',
 sparrow:'small-bird',duck:'water-bird',heron:'water-bird',crow:'flying-bird',gull:'flying-bird',
});
/**
 * Size is a nominal length in px (wingspan for crow and gull) that sets the proportions; the painted width differs
 * by a pixel or two and is what the gallery reports. Small kinds have only a few distinct designs, so neighbouring
 * sizes may draw the same. `band` is the provisional D0 §9 band for a near animal (the painted width of the preset
 * lies in it); `min` is the smallest size drawn (far animals may go below the band, D0 §9 "奥行きで縮小").
 */
export const FAUNA_SIZE:Readonly<Record<FaunaKind,{readonly band:readonly [number,number];readonly min:number;readonly preset:number}>>=Object.freeze({
 deer:{band:[8,14],min:5,preset:10},horse:{band:[8,14],min:5,preset:11},bison:{band:[8,14],min:5,preset:11},
 hare:{band:[3,7],min:3,preset:5},fox:{band:[3,7],min:4,preset:7},
 sparrow:{band:[2,5],min:2,preset:3},
 duck:{band:[4,8],min:4,preset:6},heron:{band:[4,8],min:5,preset:7},
 crow:{band:[4,10],min:3,preset:7},gull:{band:[4,10],min:3,preset:8},
});
export type FaunaPose='stand'|'graze'|'walk'|'rest'|'sit'|'hop'|'peck'|'float'|'dabble'|'wade'|'fly'|'glide';
/** Poses and their frame counts per kind. Only motions the kind can make are listed (D0 §12 D1a). */
export const FAUNA_POSES:Readonly<Record<FaunaKind,Readonly<Partial<Record<FaunaPose,number>>>>>=Object.freeze({
 deer:{stand:1,graze:2,walk:4,rest:1},horse:{stand:1,graze:2,walk:4,rest:1},bison:{stand:1,graze:2,walk:4,rest:1},
 hare:{sit:1,graze:2,hop:4},fox:{stand:1,walk:4,rest:1},
 sparrow:{stand:1,peck:2,hop:2,fly:4},
 duck:{float:2,dabble:2,fly:4},heron:{stand:1,wade:4,peck:2,fly:4},
 crow:{stand:1,peck:2,fly:4,glide:1},gull:{float:2,fly:4,glide:1},
});
export interface FaunaRect {readonly x:number;readonly y:number;readonly w:number;readonly h:number;readonly color:string}
export interface FaunaBounds {readonly left:number;readonly top:number;readonly right:number;readonly bottom:number;readonly width:number;readonly height:number}

/** Colours (D1a; to be calibrated by review). */
export const FAUNA_PALETTE=Object.freeze({
 deer:{coat:'#8b6a48',light:'#cdb894',dark:'#4f3b2a',leg:'#6a5038',antler:'#d2c4a0'},
 horse:{coat:'#a88a58',light:'#d0bd92',dark:'#3d342a',leg:'#4a3f33'},
 bison:{front:'#4b392b',back:'#6e5642',dark:'#2c2722',horn:'#c3b9a0'},
 hare:{coat:'#9c8664',light:'#ddd2bb',dark:'#4d4234'},
 fox:{coat:'#b2683b',light:'#e4d7c0',dark:'#3a2e26'},
 sparrow:{coat:'#7c5f44',light:'#c9b590',dark:'#463a2f'},
 duck:{coat:'#7d6c57',head:'#3d5b47',bill:'#c9a24a',light:'#d1c6ae',ripple:'#b0ccc7'},
 heron:{coat:'#9aa1a1',back:'#6f7777',dark:'#3f4444',leg:'#5f6058',bill:'#c8b45a'},
 crow:{coat:'#2f3133',light:'#51555a'},
 gull:{coat:'#e6e4dc',dark:'#7f8784',tip:'#3d4245',bill:'#c9a24a',ripple:'#b0ccc7'},
});

/** Rows are given as heights above the lowest row: `r(x,h,w,n)` covers heights h..h+n-1, i.e. y = -(h+n-1) .. -h. */
type Pen=(x:number,h:number,w:number,n:number,color:string)=>void;
const round=(v:number)=>Math.round(v);

// ---------------------------------------------------------------- large herbivores (one quadruped, three builds)
interface Build {body:number;bodyH:number;leg:number;neck:number}
const BUILD:Record<'deer'|'horse'|'bison',Build>={deer:{body:.6,bodyH:.2,leg:.27,neck:.2},horse:{body:.55,bodyH:.24,leg:.25,neck:.2},bison:{body:.6,bodyH:.3,leg:.17,neck:0}};
/** One leg: d shifts its lower half (−1 back, +1 forward) to make a stride. */
const leg=(r:Pen,x:number,lh:number,d:number,color:string,lower?:string)=>{
 const low=Math.max(1,Math.floor(lh/2));
 r(x,low,1,lh-low,color);r(x+d,0,1,low,lower??color);
};
/** Stride of each leg per walk frame: [back-near, back-far, front-near, front-far]. */
const STRIDE=[[-1,1,1,-1],[0,0,0,0],[1,-1,-1,1],[0,0,0,0]] as const;
function quadruped(r:Pen,kind:'deer'|'horse'|'bison',L:number,pose:FaunaPose,frame:number):void {
 const B=BUILD[kind],b=Math.max(3,round(L*B.body)),bh=Math.max(2,round(L*B.bodyH)),lh=Math.max(kind==='bison'?1:2,round(L*B.leg)),nl=Math.max(kind==='bison'?0:2,round(L*B.neck));
 const x0=-Math.floor(b/2),x1=x0+b-1,four=L>=10,lying=pose==='rest',base=lying?0:lh,top=base+bh-1;
 const P=kind==='deer'?FAUNA_PALETTE.deer:kind==='horse'?FAUNA_PALETTE.horse:null,Q=FAUNA_PALETTE.bison;
 const coat=P?.coat??Q.back,legColor=P?.leg??Q.dark,lower=kind==='horse'?FAUNA_PALETTE.horse.dark:undefined;
 // legs (far ones first and darker, so the near ones overlap them)
 if(!lying){
  const s=pose==='walk'?STRIDE[frame%4]!:[0,0,0,0];
  if(four){leg(r,x0+1,lh,s[1],P?.dark??Q.dark,lower);leg(r,x1-1,lh,s[3],P?.dark??Q.dark,lower);}
  leg(r,x0,lh,s[0],legColor,lower);leg(r,x1,lh,s[2],legColor,lower);
 }else r(x1-1,0,2,1,legColor);
 // body
 if(kind==='bison'){
  const front=Math.ceil(b/2);
  r(x0,base,b-front,bh,Q.back);r(x0+b-front,base,front,bh,Q.front);
  // the hump over the forequarters, highest just behind the head
  const hump=Math.max(1,round(L*.1));r(x0+b-front,base+bh,front-1,hump,Q.front);if(front>=3)r(x1-1,base+bh+hump,1,1,Q.front);
  r(x0-1,base+bh-2,1,1,Q.dark);
 }else{
  r(x0,base,b,bh,coat);
  if(bh>=3)r(x0+1,base,b-2,1,P!.light);
  if(kind==='deer'){r(x0,top,1,1,P!.light);if(L>=11)r(x0-1,top,1,1,P!.light);}
  else r(x0-1,base-1+(lying?1:0),1,bh+(lying?0:1),FAUNA_PALETTE.horse.dark);
 }
 // neck and head
 const head=(hx:number,hy:number)=>{
  if(kind==='deer'){
   const D=FAUNA_PALETTE.deer,w=L>=11?3:2;r(hx,hy,w,2,D.coat);r(hx+w-1,hy,1,1,D.dark);r(hx,hy+2,1,1,D.coat);
   if(L>=9){r(hx-1,hy+2,1,2,D.antler);r(hx+1,hy+3,1,1,D.antler);}
  }else if(kind==='horse'){
   const H=FAUNA_PALETTE.horse;r(hx,hy+1,2,1,H.coat);r(hx+1,hy,L>=11?2:1,1,H.coat);r(hx+(L>=11?2:1),hy,1,1,H.dark);r(hx,hy+2,1,1,H.coat);
  }else{
   const w=L>=10?2:1;r(hx,hy,w,2,Q.dark);r(hx,hy+2,1,1,Q.horn);
  }
 };
 const grazing=pose==='graze';
 if(kind==='bison'){
  if(grazing)head(x1+1,frame%2);else head(x1+1,lying?Math.max(0,bh-2):Math.max(0,lh-1));
  return;
 }
 if(grazing){
  // the neck slopes forward and down from the withers, the head in the grass ahead of the front legs (a gap stays
  // between them); frame 1 lifts the head a pixel (chewing)
  const lift=frame%2,dark=kind==='deer'?FAUNA_PALETTE.deer.dark:FAUNA_PALETTE.horse.dark,thick=kind==='horse'&&L>=11?2:1;
  let nx=x1;
  for(let h=top,i=0;h>=lift+2;h--,i++){nx=x1+1+Math.floor(i/2);r(nx-(thick-1),h,thick,1,coat);if(kind==='horse'&&i<2)r(nx-thick,h,1,1,dark);}
  r(nx+1,lift,2,2,coat);r(nx+2,lift,1,1,dark);if(kind==='deer'&&L>=9)r(x1+1,top+1,1,1,FAUNA_PALETTE.deer.antler);
  return;
 }
 const nb=top+1;
 if(kind==='horse'){
  // a thick neck arching forward, the dark mane along its back edge
  const thick=L>=11?2:1;let nx=x1;
  for(let i=0;i<nl;i++){nx=x1+Math.floor(i/2);r(nx,nb+i,thick,1,coat);r(nx-1,nb+i,1,1,FAUNA_PALETTE.horse.dark);}
  head(nx+thick-1,nb+nl-1);
  return;
 }
 const half=Math.floor(nl/2);
 r(x1,nb,1,half,coat);r(x1+1,nb+half,1,nl-half,coat);
 head(x1+1,nb+nl-1);
}

// ---------------------------------------------------------------- small ground animals
function hare(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.hare,big=L>=5;
 if(pose==='hop'&&frame%4!==0){
  // a stretched bound: frame 1 pushes off (hind foot down), 2 is in the air, 3 lands (fore paw down);
  // the motion gives the lift. Ears lie back along the body.
  const hind=frame%4===1?0:1,fore=frame%4===3?0:1,x0=big?-2:-1;
  r(x0-1,hind,1,1,P.coat);r(x0+3+(big?1:0),fore,1,1,P.coat);
  r(x0,1,big?4:3,1,P.coat);r(x0+1,2,big?3:2,1,P.coat);r(x0-1,2,1,1,P.light);
  const hx=x0+(big?4:3);r(hx,2,1,1,P.coat);r(hx,1,1,1,P.dark);r(hx-1,3,2,1,P.coat);
  return;
 }
 const grazing=pose==='graze'&&frame%2===0;
 if(big){r(-2,0,3,2,P.coat);r(-2,2,2,1,P.coat);r(-3,1,1,1,P.light);r(1,0,1,1,P.dark);}
 else{r(-1,0,2,2,P.coat);r(-2,1,1,1,P.light);}
 if(grazing){r(1,0,2,1,P.coat);r(2,0,1,1,P.dark);r(0,2,2,1,P.coat);}
 else{const hx=big?0:1;r(hx,2,2,1,P.coat);r(hx+1,2,1,1,P.dark);r(hx,3,1,big?2:1,P.coat);if(big)r(hx+1,3,1,1,P.coat);}
}
function fox(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.fox;
 if(pose==='rest'){r(-2,0,4,2,P.coat);r(-3,0,1,1,P.coat);r(-4,0,1,1,P.light);r(2,1,1,2,P.coat);r(2,2,1,1,P.dark);return;}
 const s=pose==='walk'?STRIDE[frame%4]!:[0,0,0,0],big=L>=6;
 r(-1,0,1,1,P.dark);r(1+s[2],0,1,1,P.dark);if(s[0])r(-1+s[0],0,1,1,P.dark);
 r(-1,1,1,1,P.coat);r(1,1,1,1,P.coat);
 r(-1,2,3,big?2:1,P.coat);r(-1,2,3,1,big?P.light:P.coat);r(-1,2+(big?1:0),3,1,P.coat);
 r(-3,2,2,1,P.coat);r(-3,2,1,1,P.light);
 const hy=big?3:2;r(2,hy,2,1,P.coat);r(3,hy,1,1,P.dark);r(2,hy+1,1,1,P.coat);
}

// ---------------------------------------------------------------- birds
/** Frontal flight silhouette: wing heights per stroke frame (up V / flat / down Λ / flat) and a glide arch. */
function flier(r:Pen,span:number,frame:number,glide:boolean,wing:string,body:string,tip?:string):void {
 const half=Math.max(1,Math.floor((span-2)/2)),by=2;
 r(-1,by,2,1,body);
 for(let i=1;i<=half;i++){
  const rise=glide?(i<half?1:0):[Math.min(i,2),i===half&&half>2?1:0,-Math.min(i,2),0][frame%4]!;
  const col=tip&&i===half?tip:wing;
  r(-1-i,by+rise,1,1,col);r(i,by+rise,1,1,col);
 }
 if(span%2===1&&!glide&&frame%4===1)r(-1-half-1,by,1,1,tip??wing);
}
function sparrow(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.sparrow;
 if(pose==='fly'){flier(r,Math.max(3,L+1),frame,false,P.coat,P.dark);return;}
 const big=L>=4,tuck=pose==='hop'&&frame%2===1,peck=pose==='peck'&&frame%2===0;
 if(!tuck)r(0,0,1,1,P.dark);
 // a plump body with the tail behind; the head drops forward when pecking
 r(-2,1,1,1,P.dark);r(-1,1,big?3:2,1,P.coat);if(big)r(0,1,1,1,P.light);
 if(peck){r(big?2:1,1,1,1,P.dark);r(-1,2,big?2:1,1,P.coat);}
 else{r(-1,2,big?3:2,1,P.coat);r(big?1:0,2,1,1,P.dark);if(big)r(2,2,1,1,P.dark);}
}
function duck(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.duck;
 if(pose==='fly'){flier(r,L,frame,false,P.coat,P.head);return;}
 const w=L>=6?4:3,x0=-Math.floor(w/2);
 if(pose==='dabble'){
  r(x0,0,w,1,P.coat);r(x0,1,2,1,P.coat);r(x0,2,1,1,P.light);
  r(x0+w+(frame%2),0,1,1,P.ripple);
  return;
 }
 r(x0,0,w,L>=6?2:1,P.coat);r(x0,0,w,1,P.light);r(x0,0,w-1,1,P.coat);r(x0-1,1,1,1,P.coat);
 const hy=L>=6?2:1;r(x0+w-1,hy,1,1,P.head);r(x0+w-1,hy+1,2,1,P.head);r(x0+w+1,hy+1,1,1,P.bill);
 // a ripple behind the bird, alternating (only drawn on the water row of the bird)
 r(x0-2-(frame%2),0,1,1,P.ripple);
}
function heron(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.heron,lh=L>=7?3:2;
 if(pose==='fly'){flier(r,L+3,frame,false,P.coat,P.back,P.dark);return;}
 const raised=pose==='wade'&&frame%2===1;
 r(0,0,1,lh,P.leg);if(raised)r(-1,1,1,lh-1,P.leg);else if(pose==='wade')r(-1,0,1,lh,P.leg);
 const b=lh;r(-2,b,4,2,P.coat);r(-2,b+1,3,1,P.back);r(-3,b,1,1,P.back);
 if(pose==='peck'){
  // fishing: the neck held forward level with the back, the bill pointing down; frame 1 is the strike
  const d=frame%2;r(2,b+1-d,2,1,P.coat);r(4,b+1-d,1,1,P.dark);r(4,b-d,1,1,P.bill);if(L>=7)r(4,b-1-d,1,1,P.bill);
  return;
 }
 r(1,b+2,1,1,P.coat);r(2,b+3,1,1,P.coat);r(1,b+4,2,1,P.coat);r(1,b+5,1,1,P.dark);r(3,b+4,L>=7?2:1,1,P.bill);
}
function crow(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.crow;
 if(pose==='fly'||pose==='glide'){flier(r,L,frame,pose==='glide',P.coat,P.coat);return;}
 r(0,0,1,1,P.coat);r(-1,1,3,2,P.coat);r(-2,2,1,1,P.coat);
 if(pose==='peck'&&frame%2===0)r(2,0,1,2,P.coat);else{r(1,3,2,1,P.coat);r(3,3,1,1,P.light);}
}
function gull(r:Pen,L:number,pose:FaunaPose,frame:number):void {
 const P=FAUNA_PALETTE.gull;
 if(pose==='fly'||pose==='glide'){flier(r,L,frame,pose==='glide',P.coat,P.coat,P.tip);return;}
 r(-2,0,4,1,P.coat);r(-2,1,3,1,P.dark);r(-3,1,1,1,P.tip);r(1,1,1,2,P.coat);r(2,2,1,1,P.bill);
 r(-4-(frame%2),0,1,1,P.ripple);
}

const DRAW:Record<FaunaKind,(r:Pen,L:number,pose:FaunaPose,frame:number)=>void>={
 deer:(r,L,p,f)=>quadruped(r,'deer',L,p,f),horse:(r,L,p,f)=>quadruped(r,'horse',L,p,f),bison:(r,L,p,f)=>quadruped(r,'bison',L,p,f),
 hare,fox,sparrow,duck,heron,crow,gull,
};

/** Rows of clearance under the airborne frame of a hop (its lowest row is y=−lift). Every other ground frame touches y=0. */
export function faunaLift(kind:FaunaKind,size:number,pose:FaunaPose,frame:number):number {
 if(pose!=='hop')return 0;
 if(kind==='hare')return frame===2?(size>=5?2:1):0;
 if(kind==='sparrow')return frame===1?1:0;
 return 0;
}
/** Poses not standing on ground or water: their lowest row may be above y=0. */
export const FAUNA_AIR_POSES:readonly FaunaPose[]=Object.freeze(['fly','glide']);
/** Poses on the water surface: y=0 is the water row. */
export const FAUNA_WATER_POSES:readonly FaunaPose[]=Object.freeze(['float','dabble']);

const cache=new Map<string,readonly FaunaRect[]>();
/** The rectangles of one frame, facing right (see the module comment for the origin). Cached and frozen. */
export function faunaSprite(kind:FaunaKind,size:number,pose:FaunaPose,frame:number):readonly FaunaRect[] {
 if(!Object.hasOwn(DRAW,kind))throw Error('Unknown fauna kind');
 const S=FAUNA_SIZE[kind],frames=FAUNA_POSES[kind][pose];
 if(!Number.isInteger(size)||size<S.min||size>S.band[1])throw Error(`Invalid fauna size ${kind}:${size}`);
 if(frames===undefined)throw Error(`Pose ${pose} is not made by ${kind}`);
 if(!Number.isInteger(frame)||frame<0||frame>=frames)throw Error('Invalid fauna frame');
 const key=`${kind}|${size}|${pose}|${frame}`,hit=cache.get(key);if(hit)return hit;
 // an airborne hop shape has no foot row of its own (feet tucked or stretched), so it is raised one row less
 const rects:FaunaRect[]=[],lift=Math.max(0,faunaLift(kind,size,pose,frame)-1);
 DRAW[kind]((x,h,w,n,color)=>{if(w>0&&n>0)rects.push(Object.freeze({x,y:-(h+lift+n-1),w,h:n,color}));},size,pose,frame);
 const out=Object.freeze(rects);cache.set(key,out);return out;
}
export function faunaBounds(rects:readonly FaunaRect[]):FaunaBounds {
 if(rects.length===0)throw Error('Empty fauna sprite');
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const r of rects){left=Math.min(left,r.x);top=Math.min(top,r.y);right=Math.max(right,r.x+r.w-1);bottom=Math.max(bottom,r.y+r.h-1);}
 return Object.freeze({left,top,right,bottom,width:right-left+1,height:bottom-top+1});
}
export interface FaunaRectTarget {rect(x:number,y:number,w:number,h:number,color:string):void}
/** Draws one frame with its origin at (x, y); facing −1 mirrors it about the origin column. Returns the drawn bounds. */
export function drawFauna(target:FaunaRectTarget,kind:FaunaKind,size:number,pose:FaunaPose,frame:number,x:number,y:number,facing:1|-1=1):FaunaBounds {
 if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Fauna origin must be integer pixels');
 if(facing!==1&&facing!==-1)throw Error('Invalid facing');
 const rects=faunaSprite(kind,size,pose,frame),b=faunaBounds(rects);
 for(const r of rects)target.rect(facing===1?x+r.x:x-r.x-r.w+1,y+r.y,r.w,r.h,r.color);
 return facing===1?Object.freeze({...b,left:x+b.left,right:x+b.right,top:y+b.top,bottom:y+b.bottom}):Object.freeze({...b,left:x-b.right,right:x-b.left,top:y+b.top,bottom:y+b.bottom});
}
/**
 * Depth scaling candidate (D1a comparison only): the near size × the restrained plant scale 0.58–1.00
 * (flora-scene-v1 plantScale), never below the kind's smallest size. depth 0 is the horizon (y=96), 1 the front (y=180).
 */
export function faunaDepthSize(kind:FaunaKind,nearSize:number,depth:number):number {
 if(!Number.isFinite(depth)||depth<0||depth>1)throw Error('Invalid depth');
 const S=FAUNA_SIZE[kind];return Math.max(S.min,Math.min(S.band[1],round(nearSize*(.58+.42*depth))));
}

// ---------------------------------------------------------------- short motions
/** One segment of a looping motion. `pose:'absent'` draws nothing (D0 §8: absence is part of the plan). */
export interface FaunaSegment {readonly pose:FaunaPose|'absent';readonly seconds:number;readonly fps?:number;readonly vx?:number;readonly vy?:number;readonly facing?:1|-1}
export interface FaunaMotionState {readonly pose:FaunaPose;readonly frame:number;readonly dx:number;readonly dy:number;readonly facing:1|-1}
const loopOf=(segments:readonly FaunaSegment[])=>{
 if(segments.length===0)throw Error('Empty fauna motion');
 let total=0;for(const s of segments){if(!(s.seconds>0)||!Number.isFinite(s.seconds))throw Error('Invalid segment length');if(s.fps!==undefined&&!(s.fps>0&&s.fps<=12))throw Error('Invalid fps');total+=s.seconds;}
 return total;
};
/** Net displacement over one loop (px). A motion whose loop is not closed must jump while absent or off screen. */
export function faunaMotionNet(segments:readonly FaunaSegment[]):{dx:number;dy:number} {
 loopOf(segments);return {dx:segments.reduce((a,s)=>a+(s.vx??0)*s.seconds,0),dy:segments.reduce((a,s)=>a+(s.vy??0)*s.seconds,0)};
}
/**
 * The state of a looping motion at `seconds` (the scene clock; at most 12 fps, as the live motion player).
 * Offsets are whole pixels from the start of the loop. Deterministic: only `segments` and `seconds` decide it.
 */
export function faunaMotionAt(kind:FaunaKind,segments:readonly FaunaSegment[],seconds:number):FaunaMotionState|null {
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid motion time');
 const total=loopOf(segments);let t=seconds%total,x=0,y=0,facing:1|-1=1;
 for(const s of segments){
  facing=s.facing??facing;
  if(t<s.seconds||s===segments[segments.length-1]){
   if(s.pose==='absent')return null;
   const frames=FAUNA_POSES[kind][s.pose];if(frames===undefined)throw Error(`Pose ${s.pose} is not made by ${kind}`);
   // whole ticks of the 12 fps clock (a tiny epsilon keeps t=k/12 from flooring to k−1 after the modulo)
   const tick=Math.floor(t*(s.fps??4)+1e-7),step=Math.floor(t*12+1e-7)/12;
   return {pose:s.pose,frame:tick%frames,dx:Math.floor(x+(s.vx??0)*step+1e-7),dy:Math.floor(y+(s.vy??0)*step+1e-7),facing};
  }
  x+=(s.vx??0)*s.seconds;y+=(s.vy??0)*s.seconds;t-=s.seconds;
 }
 throw Error('unreachable');
}
