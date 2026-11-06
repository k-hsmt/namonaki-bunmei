/**
 * H4-D6: 確定済み大型共同建築と、同じ観測年に利用中の住宅街区の間だけを
 * 弱く踏み慣らされた地表として描く。正式道路・広場・建築イベントではない。
 * 建設や人口の正本には一切触れず、道路が無い場所の補完もしない。
 */
import type {HousingPlot} from '../story/housing-history.js';
import type {SiteObject} from './model.js';
import type {SceneComposition} from './composition.js';
import {isUnoccupiedGround} from './housing-ground.js';

export interface CivicApproachMark extends HousingPlot {
 readonly kind:'civic-approach';
 readonly anchors:readonly [string,string];
}
interface Point {readonly x:number;readonly y:number;}
const center=(f:HousingPlot):Point=>({
 x:f.x+Math.floor(f.width/2),y:f.y+Math.floor(f.depth/2),
});
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
// 2pxの細い歩行痕が敷地の実占有に侵入しないよう、敷地の「外」に起点を置く。
const edges=(f:HousingPlot):readonly Point[]=>[
 {x:f.x+Math.floor(f.width/2),y:f.y-2},
 {x:f.x+Math.floor(f.width/2),y:f.y+f.depth},
 {x:f.x-2,y:f.y+Math.floor(f.depth/2)},
 {x:f.x+f.width,y:f.y+Math.floor(f.depth/2)},
];
const horizontal=(a:Point,b:Point):HousingPlot=>({
 x:Math.min(a.x,b.x),y:a.y,width:Math.abs(a.x-b.x)+2,depth:2,
});
const vertical=(a:Point,b:Point):HousingPlot=>({
 x:a.x,y:Math.min(a.y,b.y),width:2,depth:Math.abs(a.y-b.y)+2,
});
const route=(a:Point,b:Point,hFirst:boolean):readonly HousingPlot[]=>{
 if(a.x===b.x)return [vertical(a,b)];
 if(a.y===b.y)return [horizontal(a,b)];
 const corner=hFirst?{x:b.x,y:a.y}:{x:a.x,y:b.y};
 return hFirst?[horizontal(a,corner),vertical(corner,b)]:
  [vertical(a,corner),horizontal(corner,b)];
};

/** 最短で合法な「歩き慣らされた痕跡」を一つだけ選ぶ。
 * 同じ地形上でも、建物が存在しない年・空き家・無人の街区には出さない。
 * 川を越える直線的な道路を描くことはない（全ての線分を地表ゲートで検査）。
 */
export function projectCivicApproaches(
 scene:SceneComposition,buildings:readonly SiteObject[],
):readonly CivicApproachMark[]{
 if(scene.siteIndex!==0||scene.housingStatus!=='known')return [];
 const used=scene.residentialBlocks
  .filter(b=>b.condition!=='ruined'&&b.use!=='vacant')
  .sort((a,b)=>a.blockId.localeCompare(b.blockId));
 const allPlots=scene.residentialBlocks.map(b=>b.footprint);
 const result:CivicApproachMark[]=[];
 for(const building of [...buildings].filter(b=>b.kind==='hall'&&b.civic&&b.condition!=='ruined')
  .sort((a,b)=>a.id.localeCompare(b.id))){
  const f=building.civic!.footprint, origin=center(f);
  let best:{score:number;marks:readonly HousingPlot[];targetId:string}|undefined;
  const closest=used.filter(b=>distance(origin,center(b.footprint))<=85)
   .sort((a,b)=>distance(origin,center(a.footprint))-distance(origin,center(b.footprint))||
    a.blockId.localeCompare(b.blockId)).slice(0,6);
  for(const block of closest){
   for(const a of edges(f))for(const b of edges(block.footprint)){
    const length=distance(a,b);
    if(length<3||length>68)continue;
    // L字に曲がる場合も、両区画の地表と川を通らない経路だけに限定。
    for(const hFirst of [true,false]){
     const marks=route(a,b,hFirst);
     if(!marks.every(m=>isUnoccupiedGround(m,allPlots,buildings,0)))continue;
     // 短い痕跡を優先。建物と無関係の遠い道路網は作らない。
     const score=length+marks.length*.25;
     if(!best||score<best.score){
      best={score,marks,targetId:block.blockId};
     }
    }
   }
  }
  if(best)for(const mark of best.marks){
   result.push({...mark,kind:'civic-approach',anchors:[building.id,best.targetId]});
  }
 }
 return result;
}
