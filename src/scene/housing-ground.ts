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
function existingGround(o:SiteObject):HousingPlot{
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
