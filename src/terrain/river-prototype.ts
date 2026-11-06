/** Issue #31: 初期地形の独立試作。実ゲーム・保存・建設処理へは未接続。 */
import {hash01} from '../engine/rng.js';

export type Point=readonly [number,number];
export type Polygon=readonly Point[];
export type RiverVariant='legacy-reference'|'narrow-meander'|'broad-bend'|'island-channels';
export interface RiverPrototype {
 readonly schemaVersion:1;readonly status:'prototype-only';readonly generator:'river-prototype-v1';
 readonly siteId:'river-bank';readonly seed:number;readonly variant:RiverVariant;
 readonly water:readonly Polygon[];readonly islands:readonly Polygon[];
}
const legacy:Polygon=[
 [131,95],[147,100],[144,115],[130,128],[123,142],[144,160],
 [176,180],[265,180],[194,160],[167,146],[158,131],[165,115],[154,95],
];
export function legacyRiverReference():RiverPrototype {
 return {schemaVersion:1,status:'prototype-only',generator:'river-prototype-v1',
  siteId:'river-bank',seed:0,variant:'legacy-reference',water:[legacy.map(p=>[...p] as Point)],islands:[]};
}
const variants=['narrow-meander','broad-bend','island-channels'] as const;
export function generateRiverPrototype(seed:number):RiverPrototype{
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('地形seedは32bit符号なし整数が必要');
 const variant=variants[Math.min(2,Math.floor(hash01(seed,31,1)*3))]!;
 const bend=Math.round((hash01(seed,31,2)-.5)*18);
 const shift=Math.round((hash01(seed,31,3)-.5)*20);
 const ys=[95,112,132,154,180];
 const centers=variant==='narrow-meander'?[151,130,145,174,153]:
  variant==='broad-bend'?[119,132,159,190,217]:[149,152,159,173,193];
 const widths=variant==='narrow-meander'?[12,16,20,24,30]:
  variant==='broad-bend'?[22,32,46,64,86]:[20,36,60,74,90];
 const sections=ys.map((y,i)=>({y,center:centers[i]!+shift+(i%2?bend:-bend),width:widths[i]!}));
 const left=sections.map(s=>[Math.round(s.center-s.width/2),s.y] as Point);
 const right=sections.map(s=>[Math.round(s.center+s.width/2),s.y] as Point).reverse();
 const islands:Polygon[]=variant==='island-channels'?[[
  [159+shift-bend,124],[171+shift+bend,139],
  [181+shift+bend,154],[175+shift,166],[160+shift,151],[151+shift,137],
 ]]:[];
 return {schemaVersion:1,status:'prototype-only',generator:'river-prototype-v1',siteId:'river-bank',
  seed,variant,water:[[...left,...right]],islands};
}
export function pointInPolygon(x:number,y:number,polygon:Polygon):boolean {
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [xi,yi]=polygon[i]!,[xj,yj]=polygon[j]!;
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
/** 描画と敷地検査は同じポリゴン・同じピクセル中心を読む。島は陸地として除外する。 */
export function prototypeWaterAt(t:RiverPrototype,x:number,y:number):boolean {
 return t.water.some(p=>pointInPolygon(x,y,p))&&!t.islands.some(p=>pointInPolygon(x,y,p));
}
export function reviewPrototypePlot(t:RiverPrototype,p:{x:number;y:number;width:number;depth:number}):
 {status:'land'|'hold';reason:'water'|'boundary'|null;waterPixels:number}{
 if(![p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)||p.width<=0||p.depth<=0||
  p.x<0||p.y<95||p.x+p.width>320||p.y+p.depth>180)
  return {status:'hold',reason:'boundary',waterPixels:0};
 let waterPixels=0;
 for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++)
  if(prototypeWaterAt(t,x+.5,y+.5))waterPixels++;
 return {status:waterPixels?'hold':'land',reason:waterPixels?'water':null,waterPixels};
}
