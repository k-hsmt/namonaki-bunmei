import {findHousingGroundConflicts} from './housing-ground.js';
import {housingAt,type HousingHistory,type HousingCondition,type HousingUse,type HousingPlot} from '../story/housing-history.js';
import type {SiteObject,SiteSnapshot,VisualLevel} from './model.js';
import type {GeneratedSceneGround} from './generated-ground-review.js';

/**
 * View-only projection of a confirmed observation.
 * Facility slots are never inferred from settlement scale: all structures come from
 * SiteSnapshot.objects. Landscape marks are presentation, not simulated buildings.
 */
export interface ComposedStructure {
 readonly id:string;
 readonly kind:SiteObject['kind'];
 readonly x:number; readonly y:number;
 readonly builtYear:number;
 readonly condition:SiteObject['condition'];
 readonly footprint:'home'|'field'|'civic'|'trade'|'bridge'|'memorial';
 readonly architecturalSeed:number;
 readonly civicStyle?:'great-hall'|'courtyard-hall';
 readonly civicFootprint?:HousingPlot;
}
export interface ComposedBlock {
 readonly anchorId:string;
 readonly x:number; readonly y:number;
 readonly builtYear:number;
 readonly condition:SiteObject['condition'];
 readonly treatment:'path'|'courtyard'|'paving'|'overgrown';
}
export interface ComposedRoofPart {
 readonly partId:string;
 readonly blockId:string;
 readonly x:number;readonly y:number;
 readonly depth:'far'|'middle'|'near';
 readonly styleId:'low'|'terraced'|'courtyard';
 readonly variant:number;
 readonly representedUnits:number;
 readonly condition:HousingCondition;
 readonly use:HousingUse;
}
export interface ComposedHousingBlock {
 readonly blockId:string;readonly footprint:HousingPlot;
 readonly builtYear:number;readonly housingCount:number;
 readonly condition:HousingCondition;readonly use:HousingUse;
 readonly roofPartCount:number;readonly slotCapacity:number;
 readonly roofParts:readonly ComposedRoofPart[];
}
export interface SceneComposition {
 readonly generatedGround?:GeneratedSceneGround;
 readonly year:number;
 readonly siteIndex:number;
 readonly scale:VisualLevel;
 readonly trend:'expanding'|'stable'|'contracting'|'reorganizing';
 readonly population:number;
 readonly structures:readonly ComposedStructure[];
 readonly blocks:readonly ComposedBlock[];
 readonly riverUse:'natural'|'footpath'|'working'|'quay';
 readonly housingStatus:'unknown'|'partial'|'known';
 readonly residentialBlocks:readonly ComposedHousingBlock[];
}
function stableHash(s:string):number {
 let h=2166136261;
 for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}
 return h>>>0;
}
function footprint(kind:SiteObject['kind']):ComposedStructure['footprint'] {
 if(kind==='house'||kind==='ruin')return 'home';
 if(kind==='field')return 'field';
 if(kind==='bridge')return 'bridge';
 if(kind==='hall'||kind==='granary')return 'civic';
 if(kind==='market'||kind==='workshop')return 'trade';
 return 'memorial';
}
/**
 * 描画の屋根部品は住宅数の正本ではない。1部品で複数住戸を表せる。
 * 座標は固定敷地とstyleSeedだけで決まり、規模変更で並び替わらない。
 */
function projectHousingBlock(b:ReturnType<typeof housingAt>['blocks'][number],generated=false):ComposedHousingBlock{
 const {footprint:f}=b;
 const depth=f.y<106?'far' as const:f.y<132?'middle' as const:'near' as const;
 const step=depth==='far'?6:depth==='middle'?9:12;
 const across=Math.max(1,Math.floor(f.width/step));
 const down=Math.max(1,Math.floor(f.depth/Math.max(4,step-2)));
 const slotCapacity=across*down;
 const roofPartCount=Math.min(slotCapacity,b.housingCount);
 const roofParts:ComposedRoofPart[]=[];
 for(let i=0;i<roofPartCount;i++){
  const units=Math.floor(b.housingCount/roofPartCount)+(i<b.housingCount%roofPartCount?1:0);
  roofParts.push({
   partId:b.blockId+':'+i,blockId:b.blockId,
   x:f.x+(i%across)*step+Math.floor(step/2),
   y:generated?Math.min(f.y+f.depth-1,f.y+Math.floor(i/across)*Math.max(4,step-2)+Math.max(4,step-2)):f.y+Math.floor(i/across)*Math.max(4,step-2)+Math.max(4,step-2),
   depth,styleId:b.styleId,
   variant:(stableHash(b.blockId+':'+b.styleSeed+':'+i)%4),
   representedUnits:units,condition:b.condition,use:b.use,
  });
 }
 return {blockId:b.blockId,footprint:{...f},builtYear:b.builtYear,
  housingCount:b.housingCount,condition:b.condition,use:b.use,
  slotCapacity,roofPartCount,roofParts};
}
/** Internal projection after the caller's ground validator; legacy imports stay terrain-free. */
export function projectSceneComposition(s:SiteSnapshot,housing?:HousingHistory,generatedGround?:GeneratedSceneGround):SceneComposition {
 const scale=s.visual?.scale??0;
 const trend=s.visual?.trend??'stable';
 const structures=s.objects.map(o=>({
  id:o.id,kind:o.kind,x:o.x,y:o.y,builtYear:o.builtYear,
  condition:o.condition,footprint:footprint(o.kind),architecturalSeed:stableHash(o.id),
  ...(o.civic?{civicStyle:o.civic.architectureStyle,civicFootprint:{...o.civic.footprint}}:{}),
 }));
 const occupied=structures.filter(o=>o.footprint!=='bridge'&&o.footprint!=='memorial'&&o.footprint!=='field');
 const blocks=occupied.map(o=>({
  anchorId:o.id,x:o.x,y:o.y,builtYear:o.builtYear,condition:o.condition,
  treatment:o.condition==='ruined'?'overgrown' as const:
   o.footprint==='trade'?'paving' as const:
   o.footprint==='civic'?'courtyard' as const:'path' as const,
 }));
 const facilities=structures.filter(o=>o.condition!=='ruined');
 const working=facilities.some(o=>o.footprint==='trade');
 const bridge=facilities.some(o=>o.footprint==='bridge');
 // Do not imply a wharf exists merely because population crosses a threshold.
 const riverUse:SceneComposition['riverUse']=working?'working':bridge?'footpath':'natural';
 const siteId=(['river-bank','hill-side','coast-inlet'] as const)[s.local?.index??0]??'river-bank';
 const historic=housingAt(housing,s.year,siteId);
 const conflicts=generatedGround?[]:findHousingGroundConflicts(historic.blocks,s.objects,s.local?.index??0);
 if(conflicts.length)throw new Error('住宅街区の地表敷地が衝突: '+JSON.stringify(conflicts));
 const residentialBlocks=historic.blocks.map(b=>projectHousingBlock(b,Boolean(generatedGround)));
 return {...(generatedGround?{generatedGround}:{}),year:s.year,siteIndex:s.local?.index??0,scale,trend,
  population:s.local?.population??s.population,structures,blocks,riverUse,
 housingStatus:historic.status,residentialBlocks};
}
export function composeScene(s:SiteSnapshot,housing?:HousingHistory):SceneComposition{return projectSceneComposition(s,housing);}
