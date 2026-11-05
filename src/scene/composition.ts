import type {SiteObject,SiteSnapshot,VisualLevel} from './model.js';

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
}
export interface ComposedBlock {
 readonly anchorId:string;
 readonly x:number; readonly y:number;
 readonly builtYear:number;
 readonly condition:SiteObject['condition'];
 readonly treatment:'path'|'courtyard'|'paving'|'overgrown';
}
export interface SceneComposition {
 readonly year:number;
 readonly siteIndex:number;
 readonly scale:VisualLevel;
 readonly trend:'expanding'|'stable'|'contracting'|'reorganizing';
 readonly population:number;
 readonly structures:readonly ComposedStructure[];
 readonly blocks:readonly ComposedBlock[];
 readonly riverUse:'natural'|'footpath'|'working'|'quay';
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
export function composeScene(s:SiteSnapshot):SceneComposition {
 const scale=s.visual?.scale??0;
 const trend=s.visual?.trend??'stable';
 const structures=s.objects.map(o=>({
  id:o.id,kind:o.kind,x:o.x,y:o.y,builtYear:o.builtYear,
  condition:o.condition,footprint:footprint(o.kind),architecturalSeed:stableHash(o.id),
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
 return {year:s.year,siteIndex:s.local?.index??0,scale,trend,
  population:s.local?.population??s.population,structures,blocks,riverUse};
}
