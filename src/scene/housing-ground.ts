import type {SiteObject} from './model.js';
import type {HousingPlot,ResidentialBlock} from '../story/housing-history.js';

/** H1の物理的な土地占有検証。屋根・樹冠の描画重なりは衝突とみなさない。 */
const riverBankPolygon:readonly (readonly [number,number])[]=[
 [131,95],[147,100],[144,115],[130,128],[123,142],[144,160],
 [176,180],[265,180],[194,160],[167,146],[158,131],[165,115],[154,95],
];
const intersects=(a:HousingPlot,b:HousingPlot)=>
 a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.depth&&b.y<a.y+a.depth;
function inPolygon(x:number,y:number,polygon:readonly (readonly [number,number])[]):boolean{
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [xi,yi]=polygon[i]!,[xj,yj]=polygon[j]!;
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
export function existingGround(o:SiteObject):HousingPlot{
 if(o.kind==='bridge')return {x:o.x-28,y:o.y-3,width:56,depth:7};
 if(o.kind==='field')return {x:o.x-13,y:o.y-8,width:26,depth:14};
 return {x:o.x-9,y:o.y-4,width:18,depth:7};
}
export interface HousingGroundConflict {
 readonly blockId:string;
 readonly reason:'river'|'facility'|'block';
 readonly existingId?:string;
}
/**
 * 保存前／描画投影前に実行できる純粋な敷地検査。
 * buildingsはその年に確定して存在する施設だけを渡す（未来の建設予定は渡さない）。
 * 街区の建設イベントを発行する際にも同じ条件の再検証を要する。
 */
export function findHousingGroundConflicts(
 blocks:readonly ResidentialBlock[],buildings:readonly SiteObject[],siteIndex:number,
):HousingGroundConflict[]{
 const conflicts:HousingGroundConflict[]=[];
 for(let i=0;i<blocks.length;i++){
  const a=blocks[i]!;
  if(siteIndex===0){
   let river=false;
   for(let y=a.footprint.y;y<a.footprint.y+a.footprint.depth&&!river;y++){
    for(let x=a.footprint.x;x<a.footprint.x+a.footprint.width;x++){
     if(inPolygon(x+.5,y+.5,riverBankPolygon)){river=true;break;}
    }
   }
   if(river)conflicts.push({blockId:a.blockId,reason:'river'});
  }
  for(const o of buildings){
   if(intersects(a.footprint,existingGround(o)))conflicts.push({
    blockId:a.blockId,reason:'facility',existingId:o.id,
   });
  }
  for(const other of blocks.slice(0,i)){
   if(intersects(a.footprint,other.footprint))conflicts.push({
    blockId:a.blockId,reason:'block',existingId:other.blockId,
   });
  }
 }
 return conflicts;
}

/** H3: 後発施設の建設を確定する前に、住宅の既存敷地を確認する。
 * 廃墟も敷地を占有し続ける。屋根の表示外接矩形は判定に使わない。
 */
export function facilityHousingConflicts(
 candidate:SiteObject,blocks:readonly ResidentialBlock[],
):readonly string[]{
 const plot=existingGround(candidate);
 return blocks.filter(b=>intersects(plot,b.footprint)).map(b=>b.blockId);
}

/** H4-D2: 絵として敷地外に地面の連続色を置く場合の保守的な安全判定。
 * 道路建設イベントを表すものではない。既存地表・河川・施設を避ける。
 */
export function isUnoccupiedGround(
 strip:HousingPlot,occupiedPlots:readonly HousingPlot[],buildings:readonly SiteObject[],
 siteIndex:number,
):boolean{
 if(strip.width<=0||strip.depth<=0||strip.x<0||strip.y<0||
    strip.x+strip.width>320||strip.y+strip.depth>180)return false;
 if(occupiedPlots.some(b=>intersects(strip,b))||
    buildings.some(b=>intersects(strip,existingGround(b))))return false;
 if(siteIndex===0){
  for(let y=strip.y;y<strip.y+strip.depth;y++){
   for(let x=strip.x;x<strip.x+strip.width;x++){
    if(inPolygon(x+.5,y+.5,riverBankPolygon))return false;
   }
  }
 }
 return true;
}
