/**
 * Issue #47 B2d: the two reviewed plant painters, ported unchanged for the game (rendererId plant-sprites-v1).
 *
 * - B ("restrained", B1a review document): 13 forms, 6 variants each, drawn with integer rectangles on a
 *   96×72 sprite whose root is (48,68).
 * - A ("expressive", the PR #126 painter as extracted for B1b): 13 forms on a 72×64 sprite whose root is (36,59);
 *   young plants are the mature sprite shrunk by nearest neighbour.
 * Both are pure functions of their arguments (no random source, no clock, no DOM). The pixels are identical to
 * the reviewed prototypes; tests compare them pixel by pixel. Appearance only: nothing here is read by history.
 */
import type {PlantArchetype} from './local-flora-v1.js';

export const PLANT_SPRITES_RULE_ID='plant-sprites-v1' as const;
export interface PlantSprite {readonly width:number;readonly height:number;readonly originX:number;readonly originY:number;readonly data:Uint8ClampedArray}
export type SpriteStage='young'|'mature';
export const PLANT_VARIANTS=6;

class Pixels {
 readonly data:Uint8ClampedArray;
 constructor(readonly width:number,readonly height:number){this.data=new Uint8ClampedArray(width*height*4);}
 rect(x:number,y:number,w:number,h:number,color:string){
  const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);
  for(let yy=Math.max(0,y);yy<Math.min(this.height,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(this.width,x+w);xx++){
   const i=(yy*this.width+xx)*4;this.data[i]=r;this.data[i+1]=g;this.data[i+2]=b;this.data[i+3]=255;}
 }
}

// ---------------------------------------------------------------- B: restrained painter (B1a)
const WOOD='#625745',WOOD_DARK='#4e463a',WOOD_PALE='#8c8063';
const PALETTE:Readonly<Record<PlantArchetype,readonly [string,string,string]>>={
 deciduous:['#6f8f55','#94aa6c','#4c6b43'],evergreen:['#3f6a45','#5f8a58','#2b4c35'],conifer:['#3e5f4f','#5a7a62','#2a4239'],
 tropical:['#3d6b3a','#68924c','#28472c'],savanna:['#7f8a4e','#a2a466','#5c6440'],riparian:['#7b9a5e','#a3b878','#56744a'],
 dryShrub:['#8a8a5a','#aaa572','#666448'],coldShrub:['#7d8b6a','#9fa98a','#5d6a52'],shrub:['#5f8352','#82a066','#45633f'],
 herb:['#7f9a5e','#a1b276','#5e7a4c'],understory:['#4f7a46','#79a05e','#355a37'],wetland:['#7a9160','#a0b07a','#566c48'],moss:['#6d8a55','#b7bd9a','#4f6a42'],
};
/** B1a fixed hash of a variant and a running number (0..2^32-1); not the civilisation RNG. */
export function vh(variant:number,n:number):number {let h=Math.imul(variant+1,0x9e3779b1)^Math.imul(n+7,0x85ebca6b);h^=h>>>15;h=Math.imul(h,0xc2b2ae35);h^=h>>>13;return h>>>0;}
const BW=96,BH=72,BX=48,BY=68;
interface Pen {rect(x:number,y:number,w:number,h:number,c:string):void;under(x:number,y:number,w:number,h:number,c:string):void;clear(x:number,y:number,w:number,h:number):void;blob(cx:number,top:number,w:number,h:number,c:string):void}
function pen(r:Pixels):Pen {
 const put=(x:number,y:number,w:number,h:number,c:string)=>{x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<=0||h<=0)return;r.rect(BX+x,BY+y,w,h,c);};
 const empty=(x:number,y:number)=>{const X=BX+x,Y=BY+y;if(X<0||Y<0||X>=BW||Y>=BH)return false;return r.data[(Y*BW+X)*4+3]===0;};
 return {
  rect:put,
  under(x,y,w,h,c){for(let yy=Math.round(y);yy<Math.round(y)+Math.round(h);yy++)for(let xx=Math.round(x);xx<Math.round(x)+Math.round(w);xx++)if(empty(xx,yy))put(xx,yy,1,1,c);},
  clear(x,y,w,h){for(let yy=Math.round(y);yy<Math.round(y)+Math.round(h);yy++)for(let xx=Math.round(x);xx<Math.round(x)+Math.round(w);xx++){
   const X=BX+xx,Y=BY+yy;if(X<0||Y<0||X>=BW||Y>=BH)continue;r.data[(Y*BW+X)*4+3]=0;}},
  blob(cx,top,w,h,c){if(w<1||h<1)return;for(let j=0;j<h;j++){const t=(2*j+1-h)/h,hw=Math.max(.5,w/2*Math.sqrt(Math.max(0,1-t*t)));
   const left=Math.round(cx-hw),right=Math.round(cx+hw);put(left,top+j,Math.max(1,right-left),1,c);}},
 };
}
interface Opt {k:number;young:boolean;dense:boolean;variant:number}
const sizer=(k:number,factor:number)=>(n:number)=>Math.max(1,Math.round(n*k*factor));
const DRAW_B:Readonly<Record<PlantArchetype,(p:Pen,o:Opt,P:readonly [string,string,string])=>void>>={
 deciduous(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(10),C=z(10),top=-H-C+1;
  p.rect(0,-H,2,H,WOOD);
  const shift=vh(o.variant,1)%3-1;
  p.blob(-z(3)+shift,top+z(3),z(9),C-z(3),P[2]);
  p.blob(z(4)+shift,top+z(2),z(8)+vh(o.variant,2)%2,C-z(3),P[0]);
  p.blob(shift+1,top,z(10),C-z(2),P[0]);
  p.blob(shift-z(1),top+1,z(6),Math.max(2,z(4)),P[1]);
  if(!o.dense){for(let i=z(2);i<=z(5);i+=2){p.clear(-i,-H-i-1,2,2);p.clear(1+i,-H-i-1,2,2);}p.clear(-z(8)+shift,top+z(5),z(3),z(2));}
  const reach=o.dense?z(4):z(6);
  for(let i=1;i<=reach;i++){p.under(-i+1,-H-i,1,1,WOOD);p.under(1+i,-H-i,1,1,WOOD);}
  p.under(0,-H-reach,1,reach,WOOD);
 },
 evergreen(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(5),W=z(21),C=z(10),top=-H-C+1,shift=vh(o.variant,1)%3-1;
  p.rect(-1,-H,3,H,WOOD_DARK);p.rect(-2,-1,5,1,WOOD_DARK);
  p.blob(shift,top+z(2),W,C-z(2),P[2]);
  p.blob(shift,top,W-z(3),C-z(3),P[0]);
  p.blob(shift-z(3),top+1,Math.max(2,z(9)),Math.max(2,z(3)),P[1]);
  p.rect(shift-Math.round(W/2)+1,top+C-2,W-1,1,P[2]);
  if(!o.dense){p.clear(shift+Math.round(W/2)-z(3),top,z(4),z(4));p.clear(shift-Math.round(W/2),top+z(5),z(3),z(3));p.clear(shift-z(2),top,z(3),1);}
 },
 conifer(p,o,P){
  const z=sizer(o.k,o.young?.55:1),tiers=o.young?3:5,trunk=z(3),tier=Math.max(2,z(4)),base=z(13);
  p.rect(0,-trunk,2,trunk,WOOD_DARK);
  let y=-trunk;
  for(let t=0;t<tiers;t++){
   const w=Math.max(2,Math.round(base*(1-t/(tiers+.6)))),left=-Math.floor(w/2)+1;
   p.rect(left,y-1,w,1,P[2]);p.rect(left+1,y-tier,Math.max(1,w-2),tier-1,P[0]);p.rect(left+1,y-tier,Math.max(1,Math.floor((w-2)/2)),1,P[1]);
   y-=tier-(o.dense?0:-1);
   if(!o.dense)p.rect(0,y+1,2,1,WOOD_DARK);
  }
  p.rect(0,y-z(3),2,z(3),P[0]);p.rect(1,y-z(3)-1,1,1,P[0]);
 },
 tropical(p,o,P){
  const z=sizer(o.k,o.young?.55:1),H=z(20),W=z(25),C=Math.max(3,z(6)),top=-H-C+1;
  p.rect(0,-H,2,H,WOOD_PALE);p.rect(-1,-z(3),4,z(3),WOOD_PALE);p.rect(-2,-1,6,1,WOOD_PALE);
  p.blob(1,top+1,W,C,P[2]);p.blob(0,top,W-z(4),C-1,P[0]);
  for(let i=0;i<3;i++){const bx=-Math.round(W/2)+z(5)+i*z(6)+vh(o.variant,i)%2;p.rect(bx,top-1,z(3),2,i%2?P[1]:P[0]);}
  if(!o.young&&o.dense){
   const ly=-Math.round(H*.55),ry=-Math.round(H*.32);
   p.rect(-z(3),ly+1,z(3),1,WOOD_PALE);p.blob(-z(5),ly-1,z(7),Math.max(2,z(3)),P[0]);p.rect(-z(8),ly+1,z(6),1,P[2]);
   p.rect(2,ry+1,z(2),1,WOOD_PALE);p.blob(z(5),ry-1,z(6),Math.max(2,z(3)),P[0]);p.rect(z(3),ry+1,z(5),1,P[2]);
  }
  const vines=o.dense?3:1;for(let i=0;i<vines;i++){const vx=-Math.round(W/2)+z(4)+i*z(7);p.rect(vx,top+C,1,z(4)+vh(o.variant,30+i)%3,P[2]);}
  if(!o.dense){p.clear(-z(4),top-2,Math.max(1,z(2)),C+1);p.clear(z(6),top-2,1,C+1);}
 },
 savanna(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(6),spread=z(7),W=z(23),top=-H-spread-Math.max(2,z(3))+1;
  p.rect(0,-H,2,H,WOOD);
  for(let i=1;i<=spread;i++){p.rect(-i+1,-H-i,1,1,WOOD);p.rect(1+i,-H-i,1,1,WOOD);if(i%2)p.rect(-Math.round(i/2),-H-i,1,1,WOOD);}
  const thick=Math.max(2,z(3)),shift=vh(o.variant,1)%3-1,left=-Math.round(W/2)+1+shift;
  if(o.dense){p.rect(left,top+thick-1,W,1,P[2]);p.rect(left+1,top,W-2,thick-1,P[0]);p.rect(left+2,top,Math.round(W/2),1,P[1]);}
  else for(let i=0;i<3;i++){const pw=Math.max(2,Math.round(W/4)),px=left+i*Math.round(W/3)+(i===1?1:0);p.rect(px,top+thick-1,pw,1,P[2]);p.rect(px,top-(i===1?1:0),pw,thick-1,P[0]);p.rect(px,top-(i===1?1:0),Math.max(1,pw-2),1,P[1]);}
 },
 riparian(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(10),W=z(17),C=Math.max(3,z(6)),lean=Math.max(1,z(2)),top=-H-C+1;
  p.rect(0,-Math.round(H/2),2,Math.round(H/2),WOOD);p.rect(lean,-H,2,H-Math.round(H/2),WOOD);
  p.blob(lean,top,W,C,P[0]);p.blob(lean-z(2),top,Math.max(2,z(9)),Math.max(2,C-2),P[1]);
  const step=o.dense?2:3;
  for(let x=-Math.round(W/2)+1;x<=Math.round(W/2)-1;x+=step){const len=z(5)+vh(o.variant,40+x+20)%Math.max(2,z(4));p.rect(lean+x,top+C-1,1,len,x%4===0?P[2]:P[0]);}
 },
 dryShrub(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(6),W=z(9);
  p.rect(0,-1,2,1,WOOD_PALE);
  const twigs=o.dense?5:3;
  for(let t=0;t<twigs;t++){const dir=t-(twigs>>1),len=Math.max(2,H-(Math.abs(dir)>1?1:0)-vh(o.variant,t)%2);
   for(let i=1;i<len;i++)p.rect(Math.round(dir*i*W/(2*H))+(dir>=0?1:0),-1-i,1,1,WOOD_PALE);
   const tx=Math.round(dir*(len-1)*W/(2*H))+(dir>=0?1:0);p.rect(tx-(dir<0?1:0),-len,2,1,P[t%2?1:0]);}
  if(o.dense){p.rect(-1,-Math.max(2,z(3)),1,1,P[2]);p.rect(2,-Math.max(2,z(4)),1,1,P[2]);}
 },
 coldShrub(p,o,P){
  const z=sizer(o.k,o.young?.6:1),W=z(13),H=Math.max(2,z(3)),left=-Math.round(W/2)+1;
  if(o.dense){p.rect(left,-1,W,1,P[2]);for(let x=0;x<W;x++){const h=1+(vh(o.variant,x)%H);if(h>1)p.rect(left+x,-h,1,h-1,x%3?P[0]:P[1]);}p.rect(left+Math.round(W/3),-2,1,1,'#8a6553');}
  else{const a=Math.round(W*.4);p.rect(left,-1,a,1,P[2]);p.rect(left+1,-2,a-2,1,P[0]);p.rect(left+W-a,-1,a,1,P[2]);p.rect(left+W-a+1,-2,Math.max(1,a-3),1,P[1]);}
 },
 shrub(p,o,P){
  const z=sizer(o.k,o.young?.6:1),W=z(11),H=z(7);
  if(o.dense){p.blob(0,-H,W,H,P[2]);p.blob(-1,-H,W-z(2),H-z(2),P[0]);p.blob(-z(2),-H,Math.max(2,z(4)),Math.max(1,z(2)),P[1]);p.clear(z(2),-z(3),1,Math.max(1,z(2)));}
  else{p.blob(-z(3),-z(5),z(6),z(5),P[0]);p.blob(-z(3),-z(5),Math.max(2,z(3)),Math.max(1,z(2)),P[1]);p.blob(z(3),-z(4),z(5),z(4),P[2]);p.rect(0,-1,1,1,WOOD);}
 },
 herb(p,o,P){
  const form=o.young?'short':'tall',z=sizer(o.k,1),W=z(11),left=-Math.round(W/2)+1,step=o.dense?1:2;
  for(let x=0;x<W;x+=step){
   const v=vh(o.variant,x),base=form==='short'?1:z(4),h=Math.max(1,base+(v%Math.max(1,form==='short'?2:z(3)))-(x===0||x===W-1?1:0));
   p.rect(left+x,-h,1,h,x%3===1?P[1]:x%3===2?P[2]:P[0]);
   if(form==='tall'&&h>3&&v%3===0)p.rect(left+x+1,-h+1,1,1,P[1]);
  }
 },
 understory(p,o,P){
  const z=sizer(o.k,o.young?.6:1),reach=z(6),rise=z(4);
  const fronds=o.dense?[-1,1,-.5,.5]:[-1,1];
  fronds.forEach((d,f)=>{const r=Math.max(2,Math.round(reach*Math.abs(d))+vh(o.variant,50+f)%2),side=Math.sign(d);
   for(let i=0;i<=r;i++){const t=i/r,y=-Math.round(rise*(Math.abs(d)<1?.7:1)*4*t*(1-t*.75))-1,x=side*i+(side>0?1:0);
    p.rect(x,y,1,1,f%2?P[0]:P[2]);if(i%2===0&&i>0)p.rect(x,y-1,1,1,P[1]);}});
  p.rect(0,-1,2,1,P[2]);
  if(o.dense)p.rect(0,-rise-1,1,rise,P[0]);
 },
 wetland(p,o,P){
  const z=sizer(o.k,o.young?.55:1),W=z(9),left=-Math.round(W/2)+1,step=o.dense?1:2;
  p.rect(left,-1,W,1,P[2]);
  for(let x=0;x<W;x+=step){const v=vh(o.variant,x),h=z(6)+v%Math.max(1,z(4));
   p.rect(left+x,-h,1,h-1,x%2?P[0]:P[1]);
   if(!o.young&&v%3===0)p.rect(left+x,-h-1,1,2,'#8b7354');
  }
 },
 moss(p,o,P){
  const z=sizer(o.k,o.young?.6:1),W=z(13),left=-Math.round(W/2)+1,y0=-1;
  for(let x=0;x<W;x++){const v=vh(o.variant,x);if(!o.dense&&v%3!==0&&x!==Math.floor(W/2))continue;
   p.rect(left+x,y0,1,1,v%4===0?P[1]:P[0]);if(v%5===0)p.rect(left+x,y0-1,1,1,v%2?P[2]:P[0]);}
 },
};

/** B painter, as reviewed in B1b: dense form, base scale 1, variant 0..5. */
export function restrainedSprite(id:PlantArchetype,stage:SpriteStage,variant:number):PlantSprite {
 if(!Object.hasOwn(DRAW_B,id))throw Error('Unknown plant archetype');
 if(!Number.isInteger(variant)||variant<0||variant>=PLANT_VARIANTS)throw Error('Invalid plant variant');
 const r=new Pixels(BW,BH),k=variant===0?1:(.88+(vh(variant,99)%25)/100);
 DRAW_B[id](pen(r),{k,young:stage==='young',dense:true,variant},PALETTE[id]);
 return Object.freeze({width:BW,height:BH,originX:BX,originY:BY,data:r.data});
}

// ---------------------------------------------------------------- A: expressive painter (PR #126)
const AW=72,AH=64;
const AP={bark:'#645744',bark2:'#827254'};
function expressiveFull(id:PlantArchetype):Pixels {
 const px=new Pixels(AW,AH);
 const r=(a:number,b:number,w:number,h:number,col:string)=>px.rect(Math.round(a),Math.round(b),Math.round(w),Math.round(h),col);
 const line=(x1:number,y1:number,x2:number,y2:number,col:string,weight=1)=>{let dx=Math.abs(x2-x1),sx=x1<x2?1:-1,dy=-Math.abs(y2-y1),sy=y1<y2?1:-1,err=dx+dy;
  for(;;){r(x1,y1,weight,weight,col);if(x1===x2&&y1===y2)break;const e2=2*err;if(e2>=dy){err+=dy;x1+=sx;}if(e2<=dx){err+=dx;y1+=sy;}}};
 const oval=(cx:number,cy:number,rx:number,ry:number,col:string)=>{for(let y=-ry;y<=ry;y++){const d=1-(y*y)/(ry*ry);if(d<0)continue;const width=Math.floor(rx*Math.sqrt(d));r(cx-width,cy+y,width*2+1,1,col);}};
 const shade=(cx:number,cy:number,rx:number,ry:number,a:string,b:string)=>{oval(cx,cy,rx,ry,a);oval(cx-rx/3|0,cy-ry/3|0,Math.max(1,rx-3),Math.max(1,ry-3),b);};
 const dot=(cx:number,cy:number,radius:number,col:string,count=12)=>{for(let i=0;i<count;i++){const u=((i*17+13)%37)/36*2-1,v=((i*11+3)%31)/30*2-1;if(u*u+v*v<.95)r(Math.round(cx+u*radius),Math.round(cy+v*radius*.6),i%3===0?2:1,1,col);}};
 if(id==='deciduous'){
  r(34,30,4,30,AP.bark);r(32,56,9,3,AP.bark2);line(35,40,19,27,AP.bark,2);line(37,42,50,24,AP.bark,2);
  shade(20,25,12,9,'#4a6847','#71905c');shade(48,25,12,10,'#4e704d','#829866');shade(35,16,14,11,'#476b48','#7f9662');oval(35,30,14,7,'#527951');dot(23,22,11,'#a2ab77',16);dot(45,20,11,'#a3ac7c',14);
 }else if(id==='evergreen'){
  r(34,31,5,28,AP.bark);r(31,57,11,2,AP.bark2);line(35,39,24,30,AP.bark2,2);line(37,37,48,31,AP.bark2,2);
  oval(32,29,21,13,'#314f3c');oval(38,23,18,13,'#426a49');oval(29,19,15,12,'#507654');oval(42,25,12,9,'#58794d');dot(25,19,13,'#819a63',13);dot(41,20,13,'#819662',9);r(27,32,21,3,'#3c6043');
 }else if(id==='conifer'){
  r(34,11,3,49,'#705943');r(33,54,5,5,AP.bark2);
  for(let i=0;i<7;i++){const y=11+i*6,w=2+i*3;r(35-w,y,w*2+1,5,'#324e48');r(35-w+2,y,w*2-3,2,'#5a7962');r(35-w+1,y+4,Math.max(2,w*2-1),1,'#425e50');}
  r(34,7,2,8,'#66806d');r(35,57,2,3,AP.bark);
 }else if(id==='tropical'){
  r(33,23,5,36,'#715943');r(31,38,2,17,'#8a7151');line(33,49,25,59,'#755c46',2);line(38,50,45,59,'#755c46',2);line(35,25,18,17,AP.bark,2);line(37,24,56,19,AP.bark,2);
  oval(19,18,13,7,'#315b43');oval(50,16,15,8,'#3b6648');oval(34,11,17,10,'#3e6a49');oval(29,13,13,8,'#588055');dot(31,9,16,'#90a26b',12);
  for(const x of [13,18,49,56]){r(x,23,1,x%2?13:18,'#547753');r(x+1,29,1,2,'#8fa56e');}
 }else if(id==='savanna'){
  line(35,59,37,34,AP.bark,3);line(37,36,27,26,AP.bark,2);line(38,34,49,24,AP.bark,2);line(30,29,18,24,AP.bark2,1);line(45,27,58,24,AP.bark2,1);
  oval(22,22,14,4,'#777f53');oval(48,20,18,5,'#657a4c');oval(35,18,20,5,'#82915a');r(15,23,12,2,'#536c46');r(45,24,15,2,'#596e49');dot(39,18,20,'#b0ad75',9);
 }else if(id==='riparian'){
  r(34,26,4,33,AP.bark);line(36,35,21,27,AP.bark2,2);line(36,37,52,28,AP.bark2,2);
  oval(34,18,24,10,'#426d53');oval(23,23,17,10,'#64895e');oval(50,23,13,8,'#658f68');oval(31,13,16,8,'#93a57a');
  for(let x=13;x<60;x+=4){const top=18+(x%4),len=8+(x*7)%19;line(x,top,x+(x%3===0?1:-1),top+len,x%8===1?'#83a575':'#537e61');r(x,top+len,2,3,'#90a777');}
 }else if(id==='dryShrub'){
  for(const [a,b,c,d] of [[35,58,20,43],[37,59,45,39],[38,55,57,45],[33,57,28,47],[34,57,40,43]] as const)line(a,b,c,d,AP.bark2,1);
  for(const [x,y] of [[20,43],[25,46],[44,39],[50,46],[56,45],[35,44],[31,42]] as const){r(x-3,y-2,7,3,'#8e936b');r(x-2,y-3,4,2,'#b3a77b');r(x,y,5,2,'#6c7657');}
  r(30,58,15,1,'#928667');
 }else if(id==='coldShrub'){
  line(16,57,50,57,AP.bark2);for(const [x,dx,h] of [[20,-3,6],[28,3,7],[37,-4,9],[44,4,6],[53,3,4]] as const){line(x,57,x+dx,57-h,AP.bark2);r(x+dx-3,56-h,7,3,'#718779');r(x+dx-2,54-h,5,2,'#9fae94');}
  for(let x=13;x<60;x+=9)r(x,59,6,1,'#9a9e86');
 }else if(id==='shrub'){
  r(33,48,3,12,AP.bark);for(const [x,y,rx,ry,col] of [[19,47,12,7,'#476548'],[47,45,12,8,'#51714e'],[34,40,15,10,'#5f8156'],[28,47,15,7,'#71915d']] as const)oval(x,y,rx,ry,col);dot(34,42,21,'#9da87a',21);
 }else if(id==='herb'){
  for(const [x,ht] of [[16,13],[24,21],[32,14],[38,26],[44,18],[53,17]] as const){line(x,59,x+(x%4-2),59-ht,x%2?'#8b9661':'#a8a474');r(x+(x%4-2)-1,59-ht-3,3,4,'#c4b481');}
  for(const [x,d] of [[20,-9],[29,-7],[35,8],[42,10],[50,-7]] as const)line(x,59,x+d,52,'#58734d');
  r(19,58,34,2,'#859268');
 }else if(id==='understory'){
  for(const [x,y,dx,dy] of [[36,57,-24,-24],[36,57,25,-23],[36,57,-11,-31],[36,57,7,-37]] as const){
   line(x,y,x+dx,y+dy,'#496d52');for(let k=2;k<12;k++){const xx=x+Math.round(dx*k/13),yy=y+Math.round(dy*k/13);r(xx-3,yy-2,4,2,'#719c67');r(xx,yy-3,4,2,'#5d885c');}}
  r(34,50,3,9,'#536e51');
 }else if(id==='wetland'){
  r(12,59,49,2,'#849177');for(const [x,h] of [[18,29],[23,34],[29,25],[33,39],[39,29],[45,36],[51,27],[56,32]] as const){r(x,59-h,1,h,'#6d906c');r(x-1,59-h-4,3,6,x%2?'#826c4f':'#a18e66');line(x,54,x+6,43,'#84a174');line(x,53,x-6,46,'#7b9571');}
 }else if(id==='moss'){
  for(const [x,y,rx,ry,col] of [[18,57,10,3,'#728475'],[31,56,12,4,'#839680'],[47,57,13,3,'#a6ad8b'],[55,58,6,2,'#758b7a']] as const)oval(x,y,rx,ry,col);
  for(const [x,y] of [[21,57],[32,54],[49,55],[55,58]] as const){r(x,y,4,1,'#c0bfa0');r(x+3,y+1,1,1,'#627c77');}
  r(25,59,4,1,'#536f63');r(40,57,8,1,'#c2b99c');
 }else throw Error('Unknown plant archetype');
 return px;
}
/** A painter, as reviewed in B1b. Young sprites are the mature one shrunk (nearest neighbour), root kept at the bottom centre. */
export function expressiveSprite(id:PlantArchetype,stage:SpriteStage):PlantSprite {
 const full=expressiveFull(id);let data=full.data;
 if(stage==='young'){
  const out=new Pixels(AW,AH),scale=id==='conifer'||id==='tropical'?.56:id==='herb'||id==='moss'?.7:.64,w=Math.round(AW*scale),h=Math.round(AH*scale),dx=Math.round((AW-w)/2),dy=AH-h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=dx+x,Y=dy+y,U=Math.floor(x*AW/w),V=Math.floor(y*AH/h);
   if(X<0||Y<0||X>=AW||Y>=AH||U>=AW||V>=AH)continue;const si=(V*AW+U)*4;if(full.data[si+3]!==0)out.data.set(full.data.subarray(si,si+4),(Y*AW+X)*4);}
  data=out.data;
 }
 return Object.freeze({width:AW,height:AH,originX:36,originY:59,data});
}
