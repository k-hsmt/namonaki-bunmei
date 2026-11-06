/** Issue #31: 初期地形の独立試作。実ゲーム・保存・建設処理へは未接続。 */
import {hash01} from '../engine/rng.js';

export type Point=readonly [number,number];
export type Polygon=readonly Point[];
export const riverVariants=[
 'straight-channel','narrow-meander','broad-bend','wide-meander','diagonal-crossing',
 'island-channels','twin-islands','braided-channels','confluence','distributary',
] as const;
export type GeneratedRiverVariant=typeof riverVariants[number];
export type RiverVariant='legacy-reference'|GeneratedRiverVariant;
export const riverVariantLabels:Record<GeneratedRiverVariant,string>={
 'straight-channel':'Straight river','narrow-meander':'Narrow meander','broad-bend':'Broad bend',
 'wide-meander':'Wide S bend','diagonal-crossing':'Diagonal river','island-channels':'Large island',
 'twin-islands':'Two islands','braided-channels':'Braided river','confluence':'Confluence',
 distributary:'Distributary',
};
export interface RiverPrototype {
 readonly schemaVersion:1;readonly status:'prototype-only';readonly generator:'river-prototype-v2';
 readonly siteId:'river-bank';readonly seed:number;readonly variant:RiverVariant;
 readonly water:readonly Polygon[];readonly islands:readonly Polygon[];
}
const legacy:Polygon=[
 [131,95],[147,100],[144,115],[130,128],[123,142],[144,160],
 [176,180],[265,180],[194,160],[167,146],[158,131],[165,115],[154,95],
];
export function legacyRiverReference():RiverPrototype {
 return {schemaVersion:1,status:'prototype-only',generator:'river-prototype-v2',
  siteId:'river-bank',seed:0,variant:'legacy-reference',water:[legacy.map(p=>[...p] as Point)],islands:[]};
}
const ys=[95,110,127,145,163,180];
/** 単調なy断面間を滑らかに補間。各河道の左右岸は同じ断面と正の幅から作る。 */
function sample(values:readonly number[],y:number):number{
 let i=0;while(i<ys.length-2&&y>ys[i+1]!)i++;
 const t=Math.max(0,Math.min(1,(y-ys[i]!)/(ys[i+1]!-ys[i]!)));
 const a=values[Math.max(0,i-1)]!,b=values[i]!,c=values[i+1]!,d=values[Math.min(values.length-1,i+2)]!;
 return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
}
export function generateRiverPrototype(seed:number):RiverPrototype{
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('地形seedは32bit符号なし整数が必要');
 const variant=riverVariants[Math.min(riverVariants.length-1,Math.floor(hash01(seed,31,1)*riverVariants.length))]!;
 const shift=Math.round((hash01(seed,31,3)-.5)*24);
 const jitter=ys.map((_,i)=>(hash01(seed,i,32)-.5)*8);
 const scale=.92+hash01(seed,31,4)*.16;
 const channels:{polygon:Polygon;center:(y:number)=>number;width:(y:number)=>number}[]=[];
 const channel=(centers:readonly number[],widths:readonly number[])=>{
  const values=centers.map((x,i)=>x+shift+jitter[i]!);
  const width=(y:number)=>Math.max(6,sample(widths,y)*scale);
  const center=(y:number)=>Math.max(2+width(y)/2,Math.min(318-width(y)/2,sample(values,y)));
  const sections=Array.from({length:44},(_,i)=>Math.min(180,95+i*2));
  const left=sections.map(y=>[Math.round(center(y)-width(y)/2),y] as Point);
  const right=sections.map(y=>[Math.round(center(y)+width(y)/2),y] as Point).reverse();
  const result={polygon:[...left,...right],center,width};channels.push(result);return result;
 };
 const islands:Polygon[]=[];
 const island=(c:ReturnType<typeof channel>,cy:number,rx:number,ry:number)=>{
  islands.push(Array.from({length:24},(_,i)=>{
   const angle=i*Math.PI/12,y=cy+Math.sin(angle)*ry;
   // 中州の幅を、その高さで実在する河道の内側に制限する。
   const radius=Math.min(rx,c.width(y)/2-4);
   return [Math.round(c.center(y)+Math.cos(angle)*radius),Math.round(y)] as Point;
  }));
 };
 switch(variant){
  case 'straight-channel':channel([153,153,154,154,154,155],[14,18,23,29,35,43]);break;
  case 'narrow-meander':channel([145,127,142,172,163,151],[10,12,15,17,20,26]);break;
  case 'broad-bend':channel([108,114,138,171,204,229],[24,30,40,54,70,88]);break;
  case 'wide-meander':channel([194,224,195,123,109,156],[18,24,32,40,48,58]);break;
  case 'diagonal-crossing':channel([268,245,209,157,100,42],[16,20,26,32,40,48]);break;
  case 'island-channels':{
   const c=channel([154,153,161,175,190,202],[22,34,52,68,84,94]);
   island(c,145,13,20);break;
  }
  case 'twin-islands':{
   const c=channel([190,185,175,159,150,160],[20,32,48,66,82,100]);
   island(c,127,8,9);island(c,155,13,11);break;
  }
  case 'braided-channels':
   channel([155,150,143,174,179,185],[14,12,15,15,18,36]);
   channel([155,129,111,136,156,185],[14,12,15,15,18,36]);
   channel([155,174,198,208,207,185],[14,12,15,15,18,36]);break;
  case 'confluence':
   channel([85,100,121,146,166,182],[12,16,21,28,46,74]);
   channel([242,222,196,168,166,182],[12,16,21,28,46,74]);break;
  case 'distributary':
   channel([156,154,150,128,100,78],[14,18,22,25,28,32]);
   channel([156,154,172,202,232,260],[14,18,22,24,32,42]);break;
 }
 return {schemaVersion:1,status:'prototype-only',generator:'river-prototype-v2',siteId:'river-bank',
  seed,variant,water:channels.map(c=>c.polygon),islands};
}
/** seedで自然に選ばれる各系統の代表。比較のために生成器の系統を強制しない。 */
export function riverPrototypeExamples():readonly RiverPrototype[]{
 const found=new Map<GeneratedRiverVariant,RiverPrototype>();
 for(let seed=1;seed<=10000&&found.size<riverVariants.length;seed++){
  const t=generateRiverPrototype(seed);
  if(t.variant!=='legacy-reference'&&!found.has(t.variant))found.set(t.variant,t);
 }
 if(found.size!==riverVariants.length)throw Error('10系統すべての代表seedが見つからない');
 return riverVariants.map(v=>found.get(v)!);
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
