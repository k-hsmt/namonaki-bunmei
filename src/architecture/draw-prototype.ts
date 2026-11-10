/** Issue #35 D1: isolated 320×180 Canvas 2D prototype, never actual recorded buildings.
 * Uses plain pixels to expose silhouette / material / opening / culture trade-offs.
 */
import type {ArchitectureStyle,PreviewCase,Use,Roof} from './visual-prototype.js';
type C=CanvasRenderingContext2D;
const W=320,H=180;
const R=(c:C,x:number,y:number,w:number,h:number,col:string)=>{if(w<=0||h<=0)return;c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const polygon=(c:C,points:readonly number[],color:string)=>{c.fillStyle=color;c.beginPath();c.moveTo(points[0]!,points[1]!);for(let i=2;i<points.length;i+=2)c.lineTo(points[i]!,points[i+1]!);c.closePath();c.fill();};
function roofPath(c:C,kind:Roof,w:number,t:number,peak:number,eave:number):void{
 const l=-Math.floor(w/2)-eave,r=Math.ceil(w/2)+eave,m=0;
 c.beginPath();
 if(kind==='flat'){c.rect(l,t-6,r-l,6);return;}
 if(kind==='shed'){c.moveTo(l,t);c.lineTo(l,t-peak);c.lineTo(r,t-3);c.lineTo(r,t);}
 else if(kind==='hip'){c.moveTo(l,t);c.lineTo(l+9,t-peak+4);c.lineTo(-9,t-peak);c.lineTo(9,t-peak);c.lineTo(r-9,t-peak+4);c.lineTo(r,t);}
 else if(kind==='stepped'){c.moveTo(l,t);c.lineTo(l,t-peak+10);c.lineTo(-9,t-peak+10);c.lineTo(-9,t-peak);c.lineTo(9,t-peak);c.lineTo(9,t-peak+7);c.lineTo(r,t-peak+7);c.lineTo(r,t);}
 else if(kind==='compound'){c.moveTo(l,t);c.lineTo(l+Math.floor(w*.35),t-peak);c.lineTo(Math.floor(w*.22),t-3);c.lineTo(Math.floor(w*.3),t-peak+4);c.lineTo(r,t-peak+6);c.lineTo(r,t);}
 else {c.moveTo(l,t);c.lineTo(m,t-peak);c.lineTo(r,t);}
 c.closePath();
}
function roof(c:C,style:ArchitectureStyle,w:number,t:number,condition:'intact'|'damaged'|'ruined'):void{
 const {roof:kind,palette:p}=style;
 const e=kind==='deep-eave'?Math.max(7,style.eave):style.eave;
 const peak=kind==='steep-gable'?Math.max(19,style.steepness):Math.max(7,style.steepness);
 if(condition==='ruined'){
  R(c,-Math.floor(w/2)-1,t-3,Math.floor(w*.37),4,p.roof);
  R(c,-Math.floor(w/2)+4,t-7,6,3,p.shade);
  R(c,Math.floor(w/2)-11,t-2,7,2,p.roof);
  return;
 }
 c.save();roofPath(c,kind,w,t,peak,e);c.fillStyle=p.roof;c.fill();c.clip();
 const l=-Math.floor(w/2)-e,r=Math.ceil(w/2)+e;
 switch(style.roofMaterial){
  case 'thatch':for(let x=l;x<r;x+=4){R(c,x,t-peak+3,1,peak+2,p.trim);R(c,x+1,t-3,2,2,p.shade);}break;
  case 'shingles':for(let y=t-peak;y<t;y+=4){R(c,l,y,r-l,1,p.shade);for(let x=l+((y+peak)%7);x<r;x+=7)R(c,x,y,1,2,p.trim);}break;
  case 'boards':for(let y=t-peak;y<t;y+=5)R(c,l,y,r-l,1,p.shade);break;
  case 'slate':for(let y=t-peak;y<t;y+=4){R(c,l,y,r-l,1,p.trim);for(let x=l+3;x<r;x+=9)R(c,x,y+1,1,2,p.shade);}break;
  case 'tile':for(let y=t-peak;y<t;y+=5){R(c,l,y,r-l,1,p.trim);for(let x=l+((y+3)%8);x<r;x+=8)R(c,x,y+1,1,2,p.shade);}break;
  case 'plaster':R(c,l,t-6,r-l,2,p.shade);break;
  case 'metal':for(let x=l;x<r;x+=8)R(c,x,t-peak,1,peak+2,p.trim);R(c,l,t-2,r-l,1,p.shade);break;
 }
 c.restore();
 if(kind==='deep-eave'){R(c,l,t-2,r-l,3,p.trim);R(c,l+3,t+1,3,2,p.shade);R(c,r-6,t+1,3,2,p.shade);}
 if(kind==='compound')R(c,Math.floor(w*.21),t-11,Math.floor(w*.27),2,p.shade);
 if(condition==='damaged'){R(c,Math.floor(w*.14),t-peak+3,Math.max(3,w/7),4,p.shade);R(c,Math.floor(w*.22),t-peak+2,4,3,p.wall);}
}
function wallTexture(c:C,style:ArchitectureStyle,w:number,h:number,top:number):void{
 const {palette:p,structure,wallMaterial}=style;
 const l=-Math.floor(w/2),b=top+h;
 if(structure==='timber-frame'||structure==='mixed'||structure==='raised'){
  for(let x=l+5;x<l+w;x+=10)R(c,x,top,2,h,p.trim);
  R(c,l,top+4,w,2,p.trim);
 }
 if(structure==='plank'||wallMaterial==='planks'||wallMaterial==='logs'){
  for(let x=l+3;x<l+w-2;x+=5)R(c,x,top+1,1,h-2,p.shade);
  if(wallMaterial==='logs')for(let y=top+3;y<b;y+=5)R(c,l+1,y,w-2,1,p.trim);
 }
 if(structure==='thick-earth'||wallMaterial==='earth'||wallMaterial==='rammed-earth'){
  R(c,l,top,3,h,p.shade);R(c,l+w-3,top,3,h,p.shade);
  for(let y=top+6;y<b-2;y+=8)R(c,l+5,y,w-10,1,p.shade);
 }
 if(structure==='rubble-stone'||wallMaterial==='rubble'){
  for(let y=top+2;y<b-1;y+=5)for(let x=l+2+(y%3)*2;x<l+w-3;x+=9){R(c,x,y,6,2,p.shade);R(c,x+6,y+2,1,2,p.trim);}
 }
 if(structure==='cut-stone'||wallMaterial==='ashlar'){
  for(let y=top+4;y<b;y+=6){R(c,l+1,y,w-2,1,p.trim);for(let x=l+3+(y%4)*2;x<l+w-2;x+=12)R(c,x,y-4,1,4,p.shade);}
 }
 if(structure==='mixed'||wallMaterial==='mixed'){
  R(c,l,top+Math.floor(h*.64),w,Math.ceil(h*.36),p.shade);
  for(let x=l+2;x<l+w-3;x+=10)R(c,x,top+Math.floor(h*.72),7,2,p.trim);
 }
 if(wallMaterial==='wattle')for(let x=l+4;x<l+w-4;x+=8){R(c,x,top+4,1,h-7,p.shade);R(c,x+2,top+6,2,1,p.trim);}
}
function windowMarks(c:C,style:ArchitectureStyle,x:number,y:number):void{
 const p=style.palette,col=p.opening; const shutter=()=>{R(c,x-3,y,2,6,p.trim);R(c,x+4,y,2,6,p.trim);};
 switch(style.window){
  case 'square':R(c,x,y,5,5,col);R(c,x+2,y,1,5,p.trim);break;
  case 'narrow':R(c,x+1,y-2,3,8,col);R(c,x+1,y-2,3,1,p.trim);break;
  case 'horizontal':R(c,x-3,y,11,4,col);R(c,x+2,y,1,4,p.trim);break;
  case 'paired':R(c,x-4,y,4,6,col);R(c,x+3,y,4,6,col);break;
  case 'lattice':R(c,x-2,y-1,9,8,col);for(let d=0;d<9;d+=3)R(c,x-2+d,y-1,1,8,p.trim);for(let d=2;d<8;d+=3)R(c,x-2,y-1+d,9,1,p.trim);break;
  case 'clerestory':R(c,x-3,y-7,12,3,col);R(c,x+2,y-7,1,3,p.trim);break;
 }
 if(style.decoration==='shutters')shutter();
}
function entranceMarks(c:C,style:ArchitectureStyle,x:number,base:number,w:number,h:number):void{
 const p=style.palette,top=base-h;
 let left=x-3;
 if(style.entrance==='side'||style.entrance==='porch')left=x-Math.floor(w*.28);
 if(style.entrance==='courtyard')left=x+Math.floor(w*.16);
 let width=style.entrance==='wide'?13:6,height=style.entrance==='wide'?11:9;
 if(style.entrance==='courtyard')width=9;
 R(c,left,base-height,width,height,p.opening);
 if(style.entrance==='under-eave'||style.entrance==='porch'){R(c,left-3,base-height-4,width+6,3,p.roof);for(const dx of [-2,width+1])R(c,left+dx,base-height-1,2,10,p.trim);}
 if(style.entrance==='stairs'){for(let i=0;i<3;i++)R(c,left-1-i,base+i,8+2*i,1,p.trim);}
 if(style.entrance==='courtyard'){R(c,left-6,base-3,5,6,p.shade);R(c,left+width+1,base-3,5,6,p.shade);}
 if(style.entrance==='wide')R(c,left-1,base-height-2,width+2,2,p.trim);
 if(style.entrance==='side')R(c,left+width+2,top+3,2,5,p.shade);
}
function decorationMarks(c:C,style:ArchitectureStyle,w:number,top:number,h:number):void{
 const p=style.palette,l=-Math.floor(w/2),b=top+h;
 switch(style.decoration){
  case 'ridge-cap':R(c,-5,top-14,10,2,p.trim);R(c,-1,top-17,2,3,p.trim);break;
  case 'beam-ends':for(const x of [l+4,l+w-8]){R(c,x,top-5,5,4,p.trim);R(c,x+1,top-7,2,2,p.shade);}break;
  case 'exposed-posts':for(const x of [l+4,l+w-6])R(c,x,top+1,3,h-1,p.trim);break;
  case 'shutters':R(c,l+7,top+8,2,8,p.trim);R(c,l+17,top+8,2,8,p.trim);break;
  case 'wall-band':R(c,l+1,top+5,w-2,3,p.trim);R(c,l+1,top+6,w-2,1,p.shade);break;
  case 'small-awning':R(c,l+6,top+10,17,3,p.roof);for(const x of [l+6,l+21])R(c,x,top+13,2,6,p.trim);break;
  case 'stepping-stones':for(let i=0;i<4;i++)R(c,-4+i*4,b+i%2,3,2,p.trim);break;
  case 'geometric':for(let x=l+6;x<l+w-7;x+=8){R(c,x,top+5,4,2,p.trim);R(c,x+1,top+3,2,2,p.shade);}break;
 }
}
function technologyDetail(c:C,style:ArchitectureStyle,w:number,top:number,h:number):void{
 const p=style.palette,l=-Math.floor(w/2),b=top+h;
 if(style.technology==='long-span-timber'){
  R(c,l+2,top+3,w-4,4,p.trim);
  for(const x of [l+4,l+w-7])R(c,x,top+4,4,h-4,p.trim);
  R(c,l+12,top+12,w-24,h-14,p.shade);
  for(let x=l+18;x<l+w-17;x+=11)R(c,x,top+13,2,h-16,p.trim);
 }
 if(style.technology==='masonry-arch'){
  for(let x=l+6;x<l+w-12;x+=20){
   R(c,x,top+12,12,b-top-12,p.opening);
   R(c,x-2,top+8,16,6,p.wall);
   R(c,x,top+9,12,6,p.opening);
   R(c,x+2,top+7,8,3,p.shade);
  }
 }
 if(style.technology==='metal-glass'){
  R(c,l+4,top+4,w-8,h-6,'#a4bec0');
  for(let x=l+5;x<l+w-4;x+=11)R(c,x,top+4,2,h-6,p.trim);
  for(let y=top+9;y<top+h-2;y+=10)R(c,l+4,y,w-8,2,p.trim);
  for(let x=l+8;x<l+w-8;x+=17)R(c,x,top+5,3,3,'#d0dad5');
 }
}
/** Transparent standalone structure, used for silhouette audits. */
export function paintArchitectureBuilding(c:C,style:ArchitectureStyle,use:Use,x:number,y:number,condition:'intact'|'damaged'|'ruined'='intact',scale=1):void{
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||!Number.isSafeInteger(scale)||scale<1||scale>3)throw Error('Invalid prototype building position');
 c.save();c.translate(x,y);c.scale(scale,scale);
 const w=style.technology?68:use==='hall'?51:use==='market'?43:use==='workshop'?39:use==='granary'?29:33;
 const h=style.technology?35:use==='hall'?27:use==='granary'?21:use==='market'?18:use==='workshop'?22:19;
 const raised=style.structure==='raised'||style.foundation==='stilts';
 const base=raised?-6:0,top=base-h,p=style.palette,l=-Math.floor(w/2);
 if(raised){for(const dx of [l+4,l+w-7])R(c,dx,base,4,9,p.trim);R(c,l+3,base+8,w-6,2,p.shade);}
 if(style.foundation==='stone'||style.foundation==='terrace'){
  R(c,l-2,base,w+4,3,p.trim);if(style.foundation==='terrace'){R(c,l-5,base+3,w+10,2,p.shade);R(c,l-8,base+5,w+16,2,p.trim);}
 }else if(!raised)R(c,l,base,w,2,p.shade);
 if(condition==='ruined'){
  R(c,l,base-5,w,6,p.shade);
  R(c,l,top+4,5,h-7,p.wall);R(c,l+w-7,top+8,7,h-11,p.wall);
  R(c,l+6,base-7,Math.floor(w*.28),4,p.trim);
  roof(c,style,w,top,'ruined');
  c.restore();return;
 }
 R(c,l,top,w,h,p.wall);
 R(c,l+1,top+2,w-2,h-3,p.wall);
 wallTexture(c,style,w,h,top);
 if(condition==='damaged'){R(c,l+w-9,top+4,6,8,p.shade);R(c,l+5,top+9,3,4,p.trim);}
 if(style.technology)technologyDetail(c,style,w,top,h);
 else {
  if(use==='granary'){R(c,l+3,top+3,w-6,4,p.trim);R(c,l+11,top+8,5,7,p.opening);}
  else windowMarks(c,style,l+8,top+Math.floor(h*.35));
  if(use==='hall')windowMarks(c,style,l+w-13,top+Math.floor(h*.35));
  if(use==='market'){R(c,l+5,top+9,w-10,4,p.trim);R(c,l+6,top+13,w-12,5,p.opening);}
  if(use==='workshop')R(c,l+w-10,top+4,6,7,p.trim);
 }
 entranceMarks(c,style,0,base,w,h);
 roof(c,style,w,top,condition);
 decorationMarks(c,style,w,top,h);
 c.restore();
}
function backdrop(c:C):void{
 R(c,0,0,W,92,'#bbc9bb');R(c,0,65,W,32,'#d4cfb3');
 polygon(c,[0,109,0,89,44,73,95,96,138,82,189,101,238,77,320,93,320,111],'#8c9f8b');
 polygon(c,[0,120,0,110,56,92,112,109,164,102,230,113,271,91,320,104,320,120],'#79917b');
 R(c,0,117,W,63,'#a0a37e');R(c,0,144,W,36,'#8d9872');
 for(let x=6;x<W;x+=37){R(c,x,119+(x%11),2,3,'#788b6b');R(c,x+7,134+(x%9),2,2,'#657c5f');}
 R(c,0,152,W,4,'#a9a17e');R(c,0,163,W,2,'#898e73');
}
export function drawArchitectureD1Preview(canvas:HTMLCanvasElement,preview:PreviewCase):void{
 if(preview.premise!=='explicit-controlled-prototype-not-history')throw Error('D1 is never a historical observation');
 canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');if(!c)throw Error('2D canvas unavailable');
 c.imageSmoothingEnabled=false;backdrop(c);
 if(preview.compareFiveUses){
  const positions=[40,99,158,218,281];
  const uses:readonly Use[]=['house','granary','workshop','market','hall'];
  for(let i=0;i<uses.length;i++){
   R(c,positions[i]!-24,136,48,5,'#b3a585');
   paintArchitectureBuilding(c,preview.style,uses[i]!,positions[i]!,136);
  }
 }else{
  R(c,80,144,160,4,'#b3a585');
  paintArchitectureBuilding(c,preview.style,preview.use,160,143,preview.condition,2);
 }
}
