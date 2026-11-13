/**
 * Issue #36 D1a PROTOTYPE: the ground in a season, over the biome tint and ground materials (appearance only).
 * Grassy land greens up and turns to straw; deciduous forest floors take a little litter colour. Stable land only;
 * ground material ids, soil and occupation are never changed. Pure.
 */
import {describeFloraPatch,type FloraPatch} from '../flora/local-flora-v1.js';
import {groundSeasonLook,type SeasonalView} from './season-presentation-v1.js';
import {vh} from '../flora/plant-sprites-v1.js';

const GREEN=[0x8f,0xa8,0x5e],STRAW=[0xc2,0xad,0x74],LITTER=[0xa8,0x72,0x3e];
export function paintGroundSeason(rgba:Uint8ClampedArray,patches:readonly (FloraPatch|null)[],physics:{readonly surface:Uint8Array;readonly bearing:Uint8Array},mirror:boolean,v:SeasonalView):void {
 const looks=new Map<string,ReturnType<typeof groundSeasonLook>>();
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const rx=mirror?319-x:x,z=y*320+rx;if(physics.surface[z]!==1||physics.bearing[z]!==0)continue;
  const p=patches[Math.floor((y-96)/8)*40+Math.floor(rx/8)];if(!p)continue;
  const biome=describeFloraPatch(p).biome;let l=looks.get(biome);if(!l){l=groundSeasonLook(biome,v);looks.set(biome,l);}
  const i=(y*320+x)*4;
  for(let j=0;j<3;j++){let c=rgba[i+j]!;c=c*(1-l.green)+GREEN[j]!*l.green;c=c*(1-l.straw)+STRAW[j]!*l.straw;c=c*(1-l.litter)+LITTER[j]!*l.litter;rgba[i+j]=Math.round(c);}
 }
}

/**
 * Snow on stable land (D1b): a clumped cover (coarse and fine fixed hashes in record coordinates) that thins to
 * patches when light, thinner on slopes. Water, cliffs, sandbars and the `skip` plots (built ground, plazas,
 * bridges; record coordinates) are left as drawn. The distant ridges keep their own #34 snow line.
 */
const SNOW=[0xe9,0xed,0xe5],SNOW_SHADE=[0xd3,0xda,0xd2];
/** Smooth value noise (cells 14×7 px, bilinear) with a little per-pixel grain, so thin snow lies in patches. */
const cell=(cx:number,cy:number)=>(vh(cx+400,cy*3+1)%1000)/1000;
function snowNoise(x:number,y:number):number {
 const fx=x/14,fy=y/7,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
 const a=cell(x0,y0)*(1-sx)+cell(x0+1,y0)*sx,b=cell(x0,y0+1)*(1-sx)+cell(x0+1,y0+1)*sx;
 return (a*(1-sy)+b*sy)*.85+(vh(x,y+900)%1000)/1000*.15;
}
const snowAt=(x:number,y:number,cover:number,thin=1)=>cover*thin>=.99||snowNoise(x,y)<cover*thin;
export function paintGroundSnow(rgba:Uint8ClampedArray,physics:{readonly surface:Uint8Array;readonly bearing:Uint8Array;readonly grade?:Uint8Array},mirror:boolean,cover:number,skip:readonly {x:number;y:number;width:number;depth:number}[]):void {
 const blocked=new Uint8Array(57600);
 for(const p of skip)for(let y=Math.max(0,p.y);y<Math.min(180,p.y+p.depth);y++)for(let x=Math.max(0,p.x);x<Math.min(320,p.x+p.width);x++)blocked[y*320+x]=1;
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const rx=mirror?319-x:x,z=y*320+rx;if(physics.surface[z]!==1||physics.bearing[z]!==0||blocked[z])continue;
  if(!snowAt(rx,y,cover,physics.grade&&physics.grade[z]!>=1?.7:1))continue;
  const c=vh(rx,y)%6===0?SNOW_SHADE:SNOW,i=(y*320+x)*4;rgba[i]=c[0]!;rgba[i+1]=c[1]!;rgba[i+2]=c[2]!;
 }
}
/** Snow on the structure layer (D1b): roof and building top edges (surface 2, and 3 when deep) and fields (as ground). */
export function paintStructureSnow(rgba:Uint8ClampedArray,surface:Uint8Array,cover:number,mirror:boolean):void {
 for(let i=0;i<57600;i++){
  const kind=surface[i]!;if(!kind||rgba[i*4+3]===0)continue;const x=i%320,y=Math.floor(i/320),rx=mirror?319-x:x;
  const on=kind===1?snowAt(rx,y,cover*.9):kind===2?vh(rx+7,y)%100<cover*110:kind===3?cover>.6&&vh(rx+9,y)%100<(cover-.6)*200:false;
  if(!on)continue;const c=vh(rx,y)%5===0?SNOW_SHADE:SNOW;rgba[i*4]=c[0]!;rgba[i*4+1]=c[1]!;rgba[i*4+2]=c[2]!;
 }
}
