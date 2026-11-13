/**
 * Issue #36 D1a PROTOTYPE: a plant sprite (either painter) as it looks in a season. Appearance only.
 *
 * Leaf pixels (green-dominant) are recoloured toward the season's colour, keeping their light/dark shading, and
 * thinned by a fixed per-pixel hash when leaves fall. When most leaves are gone, bare branches are drawn from the
 * top of the trunk to the crown's outline, so a dormant tree shows its form instead of a stump. The root, trunk,
 * size and stage never change. Pure; no random source.
 */
import type {PlantArchetype} from '../flora/local-flora-v1.js';
import {vh,type PlantSprite} from '../flora/plant-sprites-v1.js';
import type {PlantSeasonLook} from './season-presentation-v1.js';

const rgb=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)) as [number,number,number];
export const SEASON_COLORS=Object.freeze({fresh:'#a7c46b',deep:'#4b7542',straw:'#bba76e',dull:'#5f6858',rust:'#9b6b46',autumn:['#d0a33c','#c77a38','#ad4f34'] as const});
const WOOD=rgb('#625745');
const BRANCHED:readonly PlantArchetype[]=['deciduous','riparian','savanna','shrub','dryShrub'];
const lum=(r:number,g:number,b:number)=>.299*r+.587*g+.114*b;
const isLeaf=(d:Uint8ClampedArray,i:number)=>d[i+3]!==0&&d[i+1]!>=d[i]!-2&&d[i+1]!>d[i+2]!+8;

/** `salt` varies autumn hues between plants (a fixed hash of the plant, not a random number). */
export function seasonSprite(s:PlantSprite,id:PlantArchetype,look:PlantSeasonLook,salt:number):PlantSprite {
 if(look.leaves>=1&&!look.tint&&!look.snow)return s;
 const d=new Uint8ClampedArray(s.data),W=s.width,H=s.height;
 let sum=0,n=0,minX=W,maxX=-1,minY=H,maxY=-1;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(!isLeaf(d,i))continue;sum+=lum(d[i]!,d[i+1]!,d[i+2]!);n++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(!n&&!look.snow)return s;
 const mean=sum/n,leafMask=new Uint8Array(W*H);
 for(let k=0;k<W*H;k++)leafMask[k]=+isLeaf(d,k*4);
 // Recolour, keeping each pixel's shading relative to the sprite's mean leaf brightness.
 if(look.tint){
  const autumn=SEASON_COLORS.autumn.map(rgb),fixed=look.tint.color==='autumn'?null:rgb(SEASON_COLORS[look.tint.color]);
  const main=salt%3,second=(salt>>>4)%3;
  for(let k=0;k<W*H;k++){if(!leafMask[k])continue;const i=k*4,x=k%W,y=Math.floor(k/W);
   const t=fixed??autumn[vh(salt,x*131+y)%5<3?main:second]!,shade=lum(d[i]!,d[i+1]!,d[i+2]!)/Math.max(1,lum(...t))*(lum(...t)/Math.max(1,mean));
   for(let j=0;j<3;j++)d[i+j]=Math.round(d[i+j]!*(1-look.tint.strength)+Math.min(255,t[j]!*shade)*look.tint.strength);}
 }
 // Leaf fall: keep a fixed share of leaf pixels.
 if(look.leaves<1){
  for(let k=0;k<W*H;k++)if(leafMask[k]&&vh(salt+17,k)%100>=look.leaves*100)d[k*4+3]=0;
  if(look.leaves<.5&&BRANCHED.includes(id))drawBranches(d,W,H,s.originX,{minX,maxX,minY,maxY},leafMask,W===72?2:1,salt);
 }
 // Snow (D1b): on the upward-facing edge of the plant as it now looks (leaves or bare branches), never below the
 // trunk base. Thicker on wide sprites (painter A is drawn smaller). A fixed per-pixel hash thins light snow.
 if(look.snow){
  const weight=W===72?2:1,base=s.originY-2,top=new Uint8Array(W*H);
  for(let y=0;y<base;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(d[i+3]===0)continue;if(y===0||d[i-W*4+3]===0)top[y*W+x]=1;}
  for(let k=0;k<W*H;k++){if(!top[k]||vh(salt+31,k)%100>=look.snow*100)continue;
   for(let t=0;t<weight+(look.snow>.6?1:0);t++){const y=Math.floor(k/W)+t,i=(y*W+k%W)*4;if(y>=base||d[i+3]===0)break;const c=(k+t)%5===0?SNOW_SHADE:SNOW;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];}}
 }
 return Object.freeze({...s,data:d});
}
const SNOW=rgb('#e9ede5'),SNOW_SHADE=rgb('#d3dad2');

function drawBranches(d:Uint8ClampedArray,W:number,H:number,ox:number,box:{minX:number;maxX:number;minY:number;maxY:number},leaf:Uint8Array,weight:number,salt:number){
 const put=(x:number,y:number)=>{for(let a=0;a<weight;a++)for(let b=0;b<weight;b++){const X=x+a,Y=y+b;if(X<0||Y<0||X>=W||Y>=H)continue;const i=(Y*W+X)*4;
  if(d[i+3]!==0&&!leaf[Y*W+X])continue;d[i]=WOOD[0];d[i+1]=WOOD[1];d[i+2]=WOOD[2];d[i+3]=255;}};
 const line=(x0:number,y0:number,x1:number,y1:number)=>{let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,e=dx+dy;
  for(;;){put(x0,y0);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}};
 // Start where the crown meets the trunk: the lowest leaf row near the trunk column.
 let start=box.minY+Math.round((box.maxY-box.minY)*.75);
 for(let y=box.maxY;y>=box.minY;y--){let hit=false;for(let x=ox-3;x<=ox+3;x++)if(x>=0&&x<W&&leaf[y*W+x])hit=true;if(hit){start=y;break;}}
 const ends=Math.max(3,Math.min(7,Math.round((box.maxX-box.minX)/(weight===2?7:4))));
 for(let e=0;e<ends;e++){
  const x=Math.round(box.minX+(box.maxX-box.minX)*(e+.5)/ends);let top=box.minY;
  for(let y=box.minY;y<=box.maxY;y++)if(leaf[y*W+x]){top=y;break;}
  const ex=x,ey=top+weight;line(ox,start,ex,ey);
  // A short fork near the tip.
  const fx=ex+((vh(salt,e)%2)?1:-1)*(2+weight),fy=ey-1-weight;line(ex,ey+weight,fx,fy);
 }
}
