/**
 * Issue #35 D2-a: integer-rectangle building drawing (architecture-draw-v1), ported verbatim from the
 * Human-accepted D1 prototype. The output is pixel-identical to D1 for every D1 sample
 * (tests/architecture-prototype.test.mjs pins the D1 PNG hashes). Pure: no RNG, no time, no canvas.
 */
import {normalizeSpec,type ArchitectureSpec,type PartialSpec,type Use} from './vocab-v1.js';

/** Any target that paints integer rectangles: a pixel raster, a canvas adapter, or a bounds probe. */
export interface RectTarget {rect(x:number,y:number,w:number,h:number,color:string):void}

const slots={
 P01:{timber:'#7a5f4a',plaster:'#b9a787',earth:'#a8926c',stone:'#9c9684',roof:'#5d554c',straw:'#8f7f58',accent:'#4f4a40'},
 P02:{timber:'#7b5a3f',plaster:'#d0b47e',earth:'#c29a5c',stone:'#a79a7c',roof:'#9a5a42',straw:'#b09658',accent:'#8a4c38'},
 P03:{timber:'#6f675c',plaster:'#d6d2c0',earth:'#bdb8a4',stone:'#a4a8a4',roof:'#667884',straw:'#9a9a80',accent:'#4f6470'},
 P04:{timber:'#8a7862',plaster:'#ddd3ba',earth:'#cdbf9f',stone:'#b3ab98',roof:'#8c8474',straw:'#a39a7a',accent:'#7b6f5c'},
 P05:{timber:'#6b5444',plaster:'#c9b08a',earth:'#b08a66',stone:'#8f9a98',roof:'#7f6a5a',straw:'#9b8a5c',accent:'#5c6f73'},
} as const;
type Slots={timber:string;plaster:string;earth:string;stone:string;roof:string;straw:string;accent:string};
const DARK='#454e48',GLASS='#a9c4c2',GLASS_HI='#cfdcd2',METAL='#5b6466';

const hex=(c:string)=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)] as const;
const toHex=(v:readonly number[])=>'#'+v.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('');
const mix=(a:string,b:string,t:number)=>{const p=hex(a),q=hex(b);return toHex(p.map((n,i)=>n+(q[i]!-n)*t));};
const dark=(c:string,t=.22)=>mix(c,'#2c302c',t),light=(c:string,t=.2)=>mix(c,'#f4ecd6',t);
/** P06: a condition, not a culture. */
const fade=(c:string)=>mix(c,'#a3a290',.42);
const hash=(x:number,y:number,k=0)=>{let h=Math.imul(x*374761393+y*668265263+k*2147483647|0,1274126177);h^=h>>>15;return (h>>>0)%97;};

/** Base wall-mass sizes per use (D1). Production plots are reconciled in D2-c. */
export const useSizes:Readonly<Record<Use,readonly [number,number]>>={house:[19,11],rowhouse:[39,11],courtyard:[35,10],granary:[17,14],workshop:[27,12],market:[33,11],hall:[37,15]};

interface Mass {x:number;w:number;top:number;main?:boolean;link?:boolean;wing?:boolean}
interface Crown {apex:[number,number];H:number;xa:number;xb:number;ridge?:[number,number];flat?:boolean}

/** Wall, roof and material colours of a normalized spec (shared by the full drawing and the D2-c miniature). */
export function architectureColors(s:ArchitectureSpec){
 let p:Slots={...slots[s.palette]};
 if(s.faded)p=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,fade(v)])) as Slots;
 const tone=(c:string)=>s.faded?fade(c):c;
 const wall={log:p.timber,plank:light(p.timber,.12),wattle:p.plaster,earth:p.earth,rammed:mix(p.earth,p.stone,.25),
  rubble:p.stone,ashlar:light(p.stone,.12),mixed:light(p.timber,.1),metal:tone(METAL),composite:tone('#b9bdb2')}[s.wall];
 const roof={thatch:p.straw,shingle:dark(p.timber,.12),slate:mix(p.stone,'#56656e',.55),tile:p.roof,plaster:light(p.earth,.18),
  metal:tone('#6f7f80'),glazed:tone(GLASS)}[s.roofMaterial];
 return {p,tone,wall,roof};
}
export const shade={dark,light,mix};
/**
 * Optional size override (D2-c, civic halls widened to their plot). Omitted, the D1 size is used and
 * the output is pixel-identical to D1 (pinned by the D1 gallery hashes).
 */
export interface ArchitectureSize {readonly width?:number;readonly height?:number}
/** cx = building centre, gy = ground line (the building occupies rows above it). */
export function drawArchitecture(g:RectTarget,input:PartialSpec&{readonly use:Use},cx:number,gy:number,size?:ArchitectureSize):ArchitectureSpec {
 const s=normalizeSpec(input),deep=s.eaves==='deep';
 const {p,tone}=architectureColors(s);
 const R=(x:number,y:number,w:number,h:number,c:string)=>{if(w>0&&h>0)g.rect(x,y,w,h,c);};
 if(size&&[size.width,size.height].some(v=>v!==undefined&&(!Number.isSafeInteger(v)||v<8||v>120)))throw Error('architecture: invalid size override');
 const [w0,h0]=useSizes[s.use];
 let w=size?.width??w0,h=(size?.height??h0)+(s.storeys-1)*8;
 if(s.structure==='X1'&&['hall','market','workshop'].includes(s.use)&&size?.width===undefined){w+=8;}
 if(s.structure==='S03')h-=1;
 const {wall:wallColor,roof:roofColor}=architectureColors(s);
 const lift={F1:0,F2:2,F3:2,F4:4,F5:6,F6:3}[s.foundation];
 const x0=cx-(w>>1),base=gy-lift,top=base-h;
 const ov=deep?4:s.structure==='S03'&&s.roofFamily==='R05'?0:1;

 // 1. foundation
 if(s.foundation==='F1')R(x0,gy-1,w,1,dark(wallColor,.3));
 if(s.foundation==='F2'){R(x0-1,gy-2,w+2,2,p.stone);for(let x=x0;x<x0+w;x+=4)R(x,gy-2,1,1,dark(p.stone,.2));}
 if(s.foundation==='F3'){for(let x=x0+1;x<x0+w-1;x+=4)R(x,gy-2,1,2,dark(p.timber,.2));R(x0,gy-3,w,1,dark(p.timber,.1));}
 if(s.foundation==='F4'){R(x0-4,gy-2,w+8,2,dark(p.stone,.12));R(x0-2,gy-4,w+4,2,p.stone);}
 if(s.foundation==='F5'){R(x0+1,gy-1,w-2,1,'#7d8062');for(let x=x0;x<x0+w-2;x+=Math.max(4,Math.round((w-1)/Math.round(w/6))))R(x,gy-6,1,6,dark(p.timber,.25));R(x0+w-1,gy-6,1,6,dark(p.timber,.25));R(x0-1,gy-7,w+2,1,dark(p.timber,.3));}
 if(s.foundation==='F6'){R(x0-3,gy-3,w+6,3,tone('#8f9288'));R(x0-3,gy-3,w+6,1,tone('#a9aca0'));}

 // 2. wall masses
 const masses:Mass[]=[];
 if(s.use==='courtyard'){
  const wing=13;masses.push({x:x0,w:wing,top,main:true},{x:x0+w-wing,w:wing,top,main:true},{x:x0+wing,w:w-2*wing,top:base-4,link:true});
 }else if(s.roofFamily==='R06'){
  const a=Math.round(w*.42),b=w>30?Math.round(w*.3):0;
  masses.push({x:x0,w:a,top:top-3,main:true});
  if(b)masses.push({x:x0+a,w:b,top:top,main:false});
  masses.push({x:x0+a+b,w:w-a-b,top:top+(b?3:2),main:false});
 }else if(s.roofFamily==='R08'){
  const wing=Math.max(7,Math.round(w*.34));
  masses.push({x:x0+w-2,w:wing,top:top+3,wing:true},{x:x0,w,top,main:true});
 }else masses.push({x:x0,w,top,main:true});

 const wallAt=(m:Mass)=>{
  const mh=base-m.top,c=wallColor;
  R(m.x,m.top,m.w,mh,c);
  if(m.link){R(m.x,m.top,m.w,1,light(c,.2));R(m.x+(m.w>>1)-1,m.top+1,3,mh-1,DARK);return;}
  switch(s.wall){
   case 'log':for(let y=m.top+1;y<base;y+=2)R(m.x,y,m.w,1,dark(c,.2));R(m.x-1,m.top+1,1,mh-1,dark(c,.3));R(m.x+m.w,m.top+1,1,mh-1,dark(c,.3));break;
   case 'plank':for(let x=m.x+2;x<m.x+m.w;x+=3)R(x,m.top,1,mh,dark(c,.14));break;
   case 'wattle':for(let x=m.x+1;x<m.x+m.w;x+=2)for(let y=m.top+1;y<base;y+=3)if(hash(x,y)%3===0)R(x,y,1,1,dark(c,.12));break;
   case 'earth':R(m.x,m.top,m.w,1,light(c,.22));R(m.x-1,base-Math.ceil(mh*.55),1,Math.ceil(mh*.55),c);R(m.x+m.w,base-Math.ceil(mh*.55),1,Math.ceil(mh*.55),c);
    R(m.x-2,base-Math.ceil(mh*.25),1,Math.ceil(mh*.25),c);R(m.x+m.w+1,base-Math.ceil(mh*.25),1,Math.ceil(mh*.25),c);break;
   case 'rammed':for(let y=m.top+2;y<base;y+=3)R(m.x,y,m.w,1,dark(c,.1));break;
   case 'rubble':for(let y=m.top;y<base;y++)for(let x=m.x;x<m.x+m.w;x++){const v=hash(x,y,3);if(v<16)R(x,y,1,1,dark(c,.25));else if(v>84)R(x,y,1,1,light(c,.22));}break;
   case 'ashlar':for(let y=m.top+2,r=0;y<base;y+=3,r++){R(m.x,y,m.w,1,dark(c,.16));for(let x=m.x+(r%2?2:5);x<m.x+m.w;x+=6)R(x,y-2,1,2,dark(c,.16));}break;
   case 'mixed':{const sh=Math.max(3,Math.round(mh*.4));R(m.x,base-sh,m.w,sh,p.stone);
    for(let y=base-sh;y<base;y++)for(let x=m.x;x<m.x+m.w;x++)if(hash(x,y,5)<14)R(x,y,1,1,dark(p.stone,.25));
    for(let x=m.x+2;x<m.x+m.w;x+=3)R(x,m.top,1,mh-sh,dark(c,.14));R(m.x,base-sh-1,m.w,1,dark(p.timber,.25));break;}
   case 'metal':R(m.x,m.top,m.w,mh,tone(GLASS));for(let x=m.x;x<m.x+m.w;x+=5)R(x,m.top,1,mh,c);R(m.x+m.w-1,m.top,1,mh,c);
    for(let y=m.top;y<base;y+=8)R(m.x,y,m.w,1,c);for(let x=m.x+2;x<m.x+m.w-1;x+=5)R(x,m.top+2,1,2,tone(GLASS_HI));break;
   case 'composite':for(let x=m.x+4;x<m.x+m.w;x+=5)R(x,m.top,1,mh,dark(c,.12));for(let y=m.top+4;y<base;y+=5)R(m.x,y,m.w,1,dark(c,.12));break;
  }
  if(s.structure==='S01'||s.structure==='X1'){
   const bay=s.structure==='X1'?10:6,t=dark(p.timber,.18);
   for(let x=m.x;x<m.x+m.w-1;x+=bay)R(x,m.top,1,mh,t);R(m.x+m.w-1,m.top,1,mh,t);R(m.x,m.top,m.w,1,t);
   if(s.structure==='X1')for(let x=m.x;x<m.x+m.w-bay;x+=bay){R(x+1,m.top+1,1,1,t);R(x+2,m.top+1,1,1,t);R(x+1,m.top+2,1,1,t);R(x+bay-1,m.top+1,1,1,t);R(x+bay-2,m.top+1,1,1,t);R(x+bay-1,m.top+2,1,1,t);}
  }
  if(s.storeys>1&&s.wall!=='metal')R(m.x,m.top+8,m.w,1,dark(c,.25));
 };

 // 3. roof, painted column by column
 const roofTex=(x:number,y:number,d:number,edge:boolean):string=>{
  const c=roofColor;
  if(edge)return light(c,.18);
  switch(s.roofMaterial){
   case 'thatch':return hash(x,y,7)<22?light(c,.2):d%3===2?dark(c,.1):c;
   case 'shingle':return d%2?dark(c,.16):c;
   case 'slate':return d%2?dark(c,.2):(x+d)%4===0?dark(c,.1):c;
   case 'tile':return x%2?dark(c,.18):c;
   case 'plaster':return c;
   case 'metal':return x%3===0?dark(c,.2):d===1?light(c,.25):c;
   case 'glazed':return x%4===0||d%4===3?tone(METAL):d===1?tone(GLASS_HI):c;
  }
 };
 const paintRoof=(xa:number,xb:number,topOf:(x:number)=>number,eave:number,thick:number)=>{
  for(let x=xa;x<xb;x++){const t=topOf(x),b=thick?Math.min(eave,t+thick):eave;
   for(let y=t;y<b;y++)R(x,y,1,1,y===b-1&&b-t>1?dark(roofColor,.3):roofTex(x,y,y-t,y===t));}
 };
 const pitchK={low:.55,mid:.85,high:1.25}[s.pitch];
 const roofOn=(m:Mass,kind:'R01'|'R02'|'R03'|'R04'|'R05',o=ov):Crown=>{
  const xa=m.x-o,xb=m.x+m.w+o,half=(xb-xa)/2,mid=xa+half-.5,e=m.top+(deep?1:0);
  if(deep)R(m.x,m.top+1,m.w,1,dark(wallColor,.35));
  if(kind==='R01'||kind==='R02'){
   const H=Math.max(4,Math.round(half*(kind==='R02'?1.5:1)*pitchK*(s.roofMaterial==='thatch'?1.1:1)));
   paintRoof(xa,xb,x=>e-Math.max(2,Math.round(H*(1-Math.abs(x-mid)/(half+.5)))),e,0);
   return {apex:[Math.round(mid),e-H],H,xa,xb};
  }
  if(kind==='R03'){
   const H=Math.max(3,Math.round(half*.5*pitchK+1.5));
   paintRoof(xa,xb,x=>e-Math.max(2,Math.min(H,Math.round((half-Math.abs(x-mid))*1.1+1))),e,0);
   const rl=Math.max(1,Math.round(half-H/1.1));R(Math.round(mid-rl)+1,e-H,Math.max(1,rl*2-1),1,light(roofColor,.3));
   return {apex:[Math.round(mid),e-H],H,xa,xb,ridge:[Math.round(mid-rl)+1,Math.round(mid+rl)-1]};
  }
  if(kind==='R04'){
   const H=Math.max(3,Math.round((xb-xa)*.3*pitchK)),topOf=(x:number)=>e-1-Math.round(H*(xb-1-x)/(xb-xa-1));
   for(let x=m.x;x<m.x+m.w;x++){const t=topOf(x)+2;if(t<e)R(x,t,1,e-t,wallColor);}
   if(s.wall==='plank'||s.wall==='mixed')for(let x=m.x+2;x<m.x+m.w;x+=3){const t=topOf(x)+2;if(t<e)R(x,t,1,e-t,dark(wallColor,.14));}
   paintRoof(xa,xb,topOf,e+1,2);
   return {apex:[xa+1,e-1-H],H,xa,xb};
  }
  paintRoof(xa,xb,()=>e-2,e,0);
  R(xa,e-3,2,1,light(roofColor,.1));R(xb-2,e-3,2,1,light(roofColor,.1));
  return {apex:[Math.round(mid),e-2],H:2,xa,xb,flat:true};
 };
 let crown:Crown|null=null;
 for(const m of masses){
  wallAt(m);
  if(m.link){R(m.x,m.top-1,m.w,1,dark(roofColor,.1));continue;}
  let kind:'R01'|'R02'|'R03'|'R04'|'R05';
  if(s.roofFamily==='R06')kind=s.roofMaterial==='plaster'?'R05':'R03';
  else if(s.roofFamily==='R08')kind=m.wing?'R04':'R01';
  else kind=s.roofFamily;
  const r=roofOn(m,kind,m.wing?1:ov);
  if(m.main&&!crown)crown=r;
  if(s.roofFamily==='R08'&&m.main){
   const gx=m.x+Math.round(m.w*.3),gh=Math.max(3,Math.round(r.H*.55));
   for(let i=0;i<gh;i++)R(gx-i,m.top-gh+i+1,i*2+1,1,i===0?light(roofColor,.25):dark(roofColor,.14));
  }
 }

 // 4. openings
 const main=masses.find(m=>m.main)!,units=s.use==='rowhouse'?3:1,frame=s.ornaments.includes('O4');
 const openDark=DARK,winColor=s.structure==='X3'?tone(GLASS_HI):'#3f4741';
 type Door=readonly [number,number,number];
 const door=(dx:number,dw=3,dh=6):Door=>{const b=base;R(dx,b-dh,dw,dh,openDark);if(s.structure==='X2'){R(dx,b-dh,1,1,wallColor);R(dx+dw-1,b-dh,1,1,wallColor);}return [dx,dw,dh];};
 const win=(wx:number,wy:number)=>{
  const F=(x:number,y:number,ww:number,hh:number)=>{if(frame)R(x-1,y-1,ww+2,hh+2,light(p.plaster,.3));R(x,y,ww,hh,winColor);if(frame){R(x-2,y,1,hh,p.accent);R(x+ww+1,y,1,hh,p.accent);}
   if(s.ornaments.includes('O6'))R(x-1,y-2,ww+2,1,dark(roofColor,.1));
   if(s.structure==='S03')R(x,y,ww,1,'#2c312d');if(s.structure==='X2'&&ww>=3){R(x,y,1,1,wallColor);R(x+ww-1,y,1,1,wallColor);}};
  switch(s.window){
   case 'W1':F(wx-1,wy,2,2);break;
   case 'W2':F(wx,wy-1,s.use==='hall'?2:1,5);break;
   case 'W3':F(wx-2,wy,5,2);break;
   case 'W4':F(wx-2,wy,2,2);F(wx+1,wy,2,2);break;
   case 'W5':R(wx-2,wy-1,5,5,light(p.plaster,.35));for(let i=0;i<5;i++)for(let j=0;j<5;j++)if((i+j)%2===0)R(wx-2+i,wy-1+j,1,1,winColor);break;
   case 'W6':break;
   case 'W7':R(wx-3,wy-2,7,6,tone(GLASS));R(wx-3,wy-2,7,1,tone(GLASS_HI));R(wx,wy-2,1,6,wallColor);break;
  }
 };
 const facade=(fx:number,fw:number,ft:number,isMainDoor:boolean):Door|null=>{
  const fh=base-ft,wy=ft+Math.max(2,Math.round(fh*.3))+(deep?1:0);
  let d:Door|null=null,slotsX:number[]=[];
  const big=fw>=25,c=fx+(fw>>1);
  if(!isMainDoor){slotsX=fw>=13?[fx+3,fx+fw-4]:[c];}
  else if(s.entrance==='E1'){d=door(c-1-(big?1:0),big?5:3,big?8:6);slotsX=big?[fx+4,fx+10,fx+fw-11,fx+fw-5]:[fx+4,fx+fw-5];}
  else if(s.entrance==='E2'){d=door(fx+2,3,6);slotsX=big?[c-4,c+3,fx+fw-11,fx+fw-5]:[c+1,fx+fw-4];}
  else if(s.entrance==='E3'){
   R(fx,ft+2,fw,1,dark(wallColor,.3));d=door(c-1-(big?1:0),big?5:3,(big?7:5));
   for(const px of big?[fx-3,fx+7,fx+fw-8,fx+fw+2]:[fx-3,fx+fw+2])R(px,ft+1,1,fh-1,dark(p.timber,.25));
   R(fx-4,base-1,fw+8,1,dark(p.timber,.05));slotsX=big?[fx+4,fx+11,fx+fw-12,fx+fw-5]:[fx+4,fx+fw-5];}
  else if(s.entrance==='E4'){
   const pw=big?9:7,ph=big?8:6,px=c-(pw>>1);R(px,base-ph,pw,ph,light(wallColor,.12));R(px-1,base-ph-1,pw+2,2,dark(roofColor,.08));R(px,base-ph-2,pw,1,light(roofColor,.15));
   R(c-1,base-ph+2,3,ph-2,openDark);d=[px,pw,ph];slotsX=big?[fx+4,fx+10,fx+fw-11,fx+fw-5]:[fx+3,fx+fw-4];}
  else if(s.entrance==='E5'){
   d=door(c-1,3,6);const st=light(p.stone,.1),n=Math.max(2,lift);
   for(let i=0;i<n;i++)R(c-2-i,base+i,5+i*2,1,i%2?dark(st,.12):st);slotsX=big?[fx+4,fx+10,fx+fw-11,fx+fw-5]:[fx+4,fx+fw-5];}
  else if(s.entrance==='E6'){
   const ww=big?13:9,wx0=fx-ww+1,wc=light(wallColor,.05);R(wx0,base-5,ww,5,wc);R(wx0,base-6,ww,1,dark(roofColor,.05));R(wx0+3,base-5,3,5,openDark);R(wx0+2,base-7,5,1,dark(roofColor,.15));
   d=null;slotsX=big?[fx+5,c-3,c+3,fx+fw-6]:[fx+5,fx+fw-6];}
  else if(s.entrance==='E7'){
   const ow=big?15:9,ox=fx+2;R(ox,base-8,ow,8,openDark);R(ox-1,base-9,ow+2,1,dark(p.timber,.3));R(ox+(ow>>1),base-8,1,8,dark(p.timber,.1));
   if(s.structure==='X2'){R(ox,base-8,2,1,wallColor);R(ox,base-7,1,1,wallColor);R(ox+ow-2,base-8,2,1,wallColor);R(ox+ow-1,base-7,1,1,wallColor);}
   d=[ox,ow,8];slotsX=big?[fx+fw-13,fx+fw-6]:[fx+fw-5];}
  if(s.window==='W6'){for(let x=fx+2;x<fx+fw-3;x+=4)R(x,ft+2+(deep?1:0),2,1,winColor);}
  else for(const x of slotsX){if(d&&x>=d[0]-3&&x<=d[0]+d[1]+2)continue;win(x,wy);if(s.storeys>1)win(x,wy+8);}
  if(s.storeys>1&&s.window!=='W6'&&d)win(d[0]+(d[1]>>1),ft+3);
  return d;
 };
 let mainDoor:Door|null=null;
 if(s.use==='courtyard'){mainDoor=facade(masses[0]!.x,masses[0]!.w,masses[0]!.top,false);facade(masses[1]!.x,masses[1]!.w,masses[1]!.top,false);}
 else if(units>1){const uw=Math.floor(main.w/units);for(let u=0;u<units;u++){if(u)R(main.x+u*uw,main.top,1,base-main.top,dark(wallColor,.3));mainDoor=facade(main.x+u*uw,uw,main.top,true);}}
 else if(s.use==='market'){
  const t=main.top+2;R(main.x+1,t,main.w-2,base-t-2,'#59605a');
  for(let x=main.x;x<main.x+main.w;x+=s.structure==='X1'?10:s.structure==='X3'?8:6)R(x,t,s.wall==='rubble'||s.wall==='ashlar'||s.wall==='earth'||s.wall==='rammed'?2:1,base-t,s.structure==='X3'?tone(METAL):s.wall==='plank'||s.wall==='wattle'||s.wall==='log'||s.wall==='mixed'?dark(p.timber,.2):wallColor);
  if(s.structure==='X2')for(let x=main.x+2;x<main.x+main.w-4;x+=6){R(x,t,1,1,wallColor);R(x+3,t,1,1,wallColor);}
  for(let x=main.x+3;x<main.x+main.w-4;x+=6)R(x,base-3,3,1,mix(p.straw,'#e2c9a1',.5));
  R(main.x,base-2,main.w,2,s.foundation==='F1'?dark(p.earth,.2):p.stone);
 }else{
  for(const m of masses)if(!m.main&&!m.link)facade(m.x,m.w,m.top,false);
  mainDoor=facade(main.x,main.w,main.top,true);
 }

 // 5. ornaments
 const O=(k:string)=>(s.ornaments as readonly string[]).includes(k);
 const cr=crown as Crown|null;
 if(O('O1')&&cr){const [ax,ay]=cr.apex,c=dark(p.timber,.35);
  if(cr.ridge){for(const rx of cr.ridge){R(rx,ay-1,1,1,c);R(rx+(rx<ax?-1:1),ay-2,1,1,c);}}
  else if(cr.flat){R(cr.xa,ay-2,1,2,c);R(cr.xb-1,ay-2,1,2,c);}
  else{R(ax-1,ay-1,1,1,c);R(ax+1,ay-1,1,1,c);R(ax-2,ay-2,1,1,c);R(ax+2,ay-2,1,1,c);}}
 if(O('O2')){const c=dark(p.timber,.4),y=main.top+(deep?1:0);for(let x=main.x+1;x<main.x+main.w;x+=3)R(x,y,1,1,c);R(main.x-2,y,1,1,c);R(main.x+main.w+1,y,1,1,c);}
 if(O('O3')){const c=dark(p.timber,.3),mh=base-main.top;R(main.x,main.top+Math.round(mh*.55),main.w,1,c);
  for(let i=0;i<Math.min(4,mh-2);i++){R(main.x+1+i,base-2-i,1,1,c);R(main.x+main.w-2-i,base-2-i,1,1,c);}R(main.x,main.top,1,mh,c);R(main.x+main.w-1,main.top,1,mh,c);}
 const md=mainDoor as Door|null;
 if(O('O5')){const y=main.top+Math.max(1,Math.round((base-main.top)*.18));for(const m of masses)if(!m.link)for(let x=m.x;x<m.x+m.w;x++)if(!(md&&x>=md[0]&&x<md[0]+md[1]&&y>=base-md[2]))R(x,y,1,1,p.accent);}
 if(O('O6')&&md)R(md[0]-2,base-md[2]-2,md[1]+4,1,dark(roofColor,.1));
 if(O('O7')){const c=light(p.stone,.2),dx=md?md[0]+(md[1]>>1):cx;for(let i=0;i<3;i++)R(dx-1+(i%2),gy+1+i*2,2,1,c);}
 if(O('O8')){const c=p.accent;
  if(cr&&!cr.flat&&!cr.ridge&&cr.H>=7){const [ax,ay]=cr.apex,y=ay+Math.round(cr.H*.55),c2=light(p.plaster,.3);R(ax,y-1,1,1,c2);R(ax-1,y,3,1,c2);R(ax,y+1,1,1,c2);}
  else{const y=main.top+Math.max(2,Math.round((base-main.top)*.45));for(let x=main.x+2;x<main.x+main.w-2;x+=4){if(md&&x>=md[0]-1&&x<=md[0]+md[1])continue;R(x,y,1,1,c);R(x+1,y-1,1,1,c);R(x+2,y,1,1,c);}}}
 if(s.faded){for(let x=x0;x<x0+w;x++)if(hash(x,top,11)<9)R(x,top-1-(hash(x,top,12)%3),1,1,'#7d8a6a');}
 return s;
}

/** Painted extent relative to (cx, gy): pixels left/right of cx, above gy, and below gy (steps). */
export interface ArchitectureEnvelope {readonly left:number;readonly right:number;readonly top:number;readonly below:number}
/** Measures the exact painted bounds by drawing into a probe. Same code path as drawing, so they cannot disagree. */
export function measureArchitecture(input:PartialSpec&{readonly use:Use}):ArchitectureEnvelope {
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 drawArchitecture({rect(x,y,w,h){minX=Math.min(minX,x);maxX=Math.max(maxX,x+w);minY=Math.min(minY,y);maxY=Math.max(maxY,y+h);}},input,0,0);
 return {left:-minX,right:maxX,top:-minY,below:Math.max(0,maxY)};
}
