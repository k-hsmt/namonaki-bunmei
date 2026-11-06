import {projectCivicApproaches} from './civic-approach.js';
/**
 * H4-D2: 確定した住宅街区と公共施設を接点にした「歩き慣らされた地面」の描画投影。
 * 新たな道路・施設の建設履歴ではない。地点0のみ地形検証済み。
 */
import type {HousingPlot} from '../story/housing-history.js';
import type {SiteObject} from './model.js';
import type {SceneComposition} from './composition.js';
import {isUnoccupiedGround} from './housing-ground.js';

export type StreetscapeMark={
 readonly kind:'lane'|'forecourt'|'civic-approach';
 readonly x:number;readonly y:number;readonly width:number;readonly depth:number;
 readonly anchors:readonly string[];
};
export function projectStreetscape(scene:SceneComposition,buildings:readonly SiteObject[]):readonly StreetscapeMark[]{
 if(scene.siteIndex!==0)return [];
 const blocks=scene.residentialBlocks;
 const plots=blocks.map(b=>b.footprint);
 const marks:StreetscapeMark[]=[];
 const active=blocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant')
  .sort((a,b)=>a.footprint.y-b.footprint.y||a.footprint.x-b.footprint.x||a.blockId.localeCompare(b.blockId));
 // 近接している街区間の「歩いた跡」だけ。住宅の存在しない土地には街路網を生やさない。
 for(let i=0;i<active.length;i++){
  const a=active[i]!;
  const af=a.footprint;
  const right=active.filter(b=>b.blockId!==a.blockId&&
   Math.abs(b.footprint.y-af.y)<=2&&
   b.footprint.x>=af.x+af.width&&
   b.footprint.x-af.x-af.width<=14)
   .sort((b,c)=>b.footprint.x-c.footprint.x||b.blockId.localeCompare(c.blockId))[0];
  if(!right)continue;
  const x=af.x+af.width, width=right.footprint.x-x;
  if(width<=0)continue;
  const y=Math.max(af.y+af.depth,right.footprint.y+right.footprint.depth);
  const strip:HousingPlot={x,y,width,depth:2};
  if(!isUnoccupiedGround(strip,plots,buildings,0))continue;
  marks.push({kind:'lane',...strip,anchors:[a.blockId,right.blockId]});
 }
 // 集会所・市場の前のごく小さな踏み固められた余白。
 // 「街の規模」ではなく当年に存在した施設だけが根拠となる。
 for(const b of [...buildings].sort((a,b)=>a.id.localeCompare(b.id))){
  if(b.condition==='ruined'||(b.kind!=='hall'&&b.kind!=='market'))continue;
  const f=b.civic?.footprint;
  const strip:HousingPlot=f
   ?{x:f.x+4,y:f.y+f.depth+1,width:f.width-8,depth:2}
   :{x:b.x-9,y:b.y+4,width:18,depth:2};
  if(!isUnoccupiedGround(strip,plots,buildings,0))continue;
  marks.push({kind:'forecourt',...strip,anchors:[b.id]});
 }
 return [...marks,...projectCivicApproaches(scene,buildings)];
}
