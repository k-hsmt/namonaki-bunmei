/** Detailed view of recorded ecology; interpolation changes appearance, never state. */
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import type {GeneratedSceneGround} from '../scene/generated-ground-review.js';
import type {RecordPoint} from '../terrain/terrain-record-types.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
export type LeafPalette=readonly [string,string,string];
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
export const landscapeBand=(n:number)=>Math.floor(n/8)*8;
function noiseHash(x:number,y:number,seed:number){let h=Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^seed;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)%256;}
export function landscapeNoise(x:number,y:number,seed:number):number {const a=x/32,b=(y-96)/24,i=Math.floor(a),j=Math.floor(b),u=a-i,v=b-j;return (noiseHash(i,j,seed)*(1-u)+noiseHash(i+1,j,seed)*u)*(1-v)+(noiseHash(i,j+1,seed)*(1-u)+noiseHash(i+1,j+1,seed)*u)*v;}
function moistureField(g:GeneratedSceneGround,x:number,y:number){const e=g.environment!,a=clamp((x-4)/8,0,39),b=clamp((y-100)/8,0,10),i=Math.floor(a),j=Math.floor(b),u=a-i,v=b-j;let sum=0,weight=0;for(const [dx,dy,w]of [[0,0,(1-u)*(1-v)],[1,0,u*(1-v)],[0,1,(1-u)*v],[1,1,u*v]]){const m=e.moisture[Math.min(10,j+dy!)*40+Math.min(39,i+dx!)];if(m!==null&&m!==undefined&&w!>0){sum+=landscapeBand(m)*w!;weight+=w!;}}return weight?sum/weight:0;}
export function paintLandscapeGround(c:CanvasRenderingContext2D,g:GeneratedSceneGround):void {
 const e=g.environment;if(!e)return;const r=readOwnedRecordPhysics(g.terrain.sites[g.site].physics),image=c.getImageData(0,0,320,180),bytes=image.data,cold=clamp((-landscapeBand(e.temperature)-18)/30,0,.7),humidity=landscapeBand(e.humidity),seed=g.terrain.source.seed^(['river-bank','hill-side','coast-inlet'].indexOf(g.site)+1)*977;
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x;if(r.surface[i]!==1||r.bearing[i]!==0)continue;const m=moistureField(g,x,y),dry=clamp((-m-8)/52,0,.85),wet=clamp((m-20)/50,0,.55)*clamp(humidity/40,0,1),strength=Math.max(dry,cold,wet);if(strength===0)continue;
  const target=dry>=cold&&dry>=wet?[185,169,119]:cold>=wet?[177,185,170]:[119,147,102],shade=(landscapeNoise(x,y,seed)-128)/32+(noiseHash(x,y,seed)%32===0?-3:0),sx=g.terrain.sites[g.site].render.mirrorX?319-x:x,j=(y*320+sx)*4;
  for(let ch=0;ch<3;ch++)bytes[j+ch]=Math.round(bytes[j+ch]!*(1-strength)+(target[ch]!+shade)*strength);bytes[j+3]=255;
 }
 // putImageData ignores the canonical-to-screen transform; indices above include mirroring.
 c.putImageData(image,0,0);
}
export function landscapePalette(m:number,temperature:number):LeafPalette {return landscapeBand(temperature)< -24?['#849688','#abb6a4','#647e72']:m< -32?['#7e8053','#a0a36b','#626e46']:m>=24?['#52754a','#789760','#3c6242']:['#5e7d50','#829c65','#466c48'];}
export function projectLandscapeVegetation(o:GeneratedSceneObservation){
 const {ground:g,snapshot:s,composition:c}=o,r=readOwnedRecordPhysics(g.terrain.sites[g.site].physics),live=new Set(s.objects.filter(b=>b.kind!=='field'||b.condition!=='ruined').map(b=>b.id)),occupied=[...g.facilities.filter(f=>live.has(f.id)).map(f=>f.plot),...c.residentialBlocks.map(b=>b.footprint),...(s.publicSpaces??[]).filter(p=>p.condition==='used').map(p=>p.footprint),...g.bridges.flatMap(b=>[b.deck,...b.bankSupports])],seed=g.terrain.source.seed^(['river-bank','hill-side','coast-inlet'].indexOf(g.site)+1)*977;
 const clear=(x:number,y:number)=>x>=0&&x<320&&y>=96&&y<180&&r.surface[y*320+x]===1&&r.bearing[y*320+x]===0&&!occupied.some(p=>x>=p.x&&x<p.x+p.width&&y>=p.y&&y<p.y+p.depth),root=(x:number,y:number,width=2)=>[0,1].every(dy=>Array.from({length:width},(_,dx)=>clear(x+dx,y+dy)&&r.grade[(y+dy)*320+x+dx]!<=1).every(Boolean));
 const grass:{point:RecordPoint;color:string;height:number}[]=[],shrubs:{point:RecordPoint;rank:number;palette:LeafPalette}[]=[],trees:{point:RecordPoint;scale:number;rank:number;palette:LeafPalette}[]=[];
 for(const p of g.vegetation??[]){const m=landscapeBand(g.environment?.moisture[p.index]??0),palette=landscapePalette(m,g.environment?.temperature??0);
  for(let n=0;n<6;n++){const h=terrainHash(['vegetation-display-v1',g.terrain.source.seed,g.site,p.index,n]),x=p.plot.x+h%8,y=p.plot.y+Math.floor(h/8)%p.plot.depth,stand=landscapeNoise(x,y,seed);if(!root(x,y))continue;
   if(p.stage>0&&stand>(m< -32?125:60)&&h%(m< -32?4:2)===0)grass.push({point:[x,y],height:p.stage===2?3:p.stage===1?2:1,color:m< -16?'#b4a575':landscapeBand(g.environment?.temperature??0)< -24?'#a8b39c':p.stage===1?'#9ea66f':'#7f9364'});
   else if(p.stage===0&&p.disturbedYear!==null&&s.year-p.disturbedYear<15&&n<4)grass.push({point:[x,y],color:'#8e856d',height:1});
   if(n<2&&p.stage===2&&h%6===0&&stand>80&&root(x,y,3))shrubs.push({point:[x,y],rank:h,palette});
   if(n<2&&p.stage>=3&&h%5===0&&stand>(p.stage===4?96:120)&&!occupied.some(q=>x>=q.x-12&&x<q.x+q.width+12&&y>=q.y-6&&y<q.y+q.depth+24))trees.push({point:[x,y],scale:(.45+(y-96)/160)*(p.stage===4?1.12:.62),rank:h,palette});
  }
 }
 shrubs.sort((a,b)=>a.rank-b.rank);trees.sort((a,b)=>a.rank-b.rank);const selected:typeof trees=[];for(const t of trees){if(selected.length===24)break;if(selected.every(q=>Math.abs(q.point[0]-t.point[0])+Math.abs(q.point[1]-t.point[1])>=9))selected.push(t);}
 return {grass,shrubs:shrubs.slice(0,36),trees:selected.sort((a,b)=>a.point[1]-b.point[1]||a.point[0]-b.point[0])};
}
