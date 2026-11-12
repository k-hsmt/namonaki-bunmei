/**
 * Issue #47 B2d: the world's plants in a confirmed scene, ordered against structures by ground line (Y).
 *
 * Layer order (B1b, Human review): terrain and ground → biome soil tint → plants behind structures → people →
 * the game's structure layer (unchanged internal order) → plants in front of structures.
 * A plant pixel is in front only where it covers a structure pixel and its root y is greater than that
 * structure's ground line (a tie keeps the structure in front). The ground line of each structure pixel is
 * found by drawing every structure alone with the game's own function, in the game's own order; the last one
 * drawn owns the pixel. Ground lines: facility footprint front edge (plot.y+depth), roof part base y, mark y.
 */
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {planFloraScene,rasterizeFlora,composeFlora,treeSwayAt,tintFloraSoil,type FloraLayer,type ScenePlant,type ScenePlot} from '../flora/flora-scene-v1.js';
import type {FloraPatch} from '../flora/local-flora-v1.js';
import type {FloraPatchView} from '../flora/flora-growth-v1.js';

export interface SceneFloraSource {readonly seed:number;readonly patches:readonly (FloraPatch|null)[];readonly views:readonly (FloraPatchView|null)[]}
/** Draws one structure-only layer of a (filtered) observation; supplied by the scene drawer. */
export type StructureLayerDrawer=(canvas:HTMLCanvasElement,o:GeneratedSceneObservation,marks:{festival:boolean;fire:boolean;cart:boolean})=>void;
type Presentation={readonly festival:{x:number;y:number}|null;readonly fire:{x:number;y:number}|null;readonly cart:{x:number;y:number}|null};

/** Standing structures' footprints (record coordinates): no plant roots there. */
export function sceneOccupiedPlots(o:GeneratedSceneObservation):ScenePlot[] {
 const live=new Set(o.snapshot.objects.filter(x=>x.kind!=='field'||x.condition!=='ruined').map(x=>x.id));
 return [...o.ground.facilities.filter(x=>live.has(x.id)).map(x=>x.plot),...o.composition.residentialBlocks.map(x=>x.footprint),
  ...(o.snapshot.publicSpaces??[]).filter(x=>x.condition==='used').map(x=>x.footprint),...o.ground.bridges.flatMap(x=>[x.deck,...x.bankSupports])];
}

/** Ground line (y) of every screen pixel of the structure layer, −1 where there is no structure. */
export function structureGroundLines(o:GeneratedSceneObservation,presentation:Presentation,draw:StructureLayerDrawer):Int16Array {
 const blocks=o.composition.residentialBlocks,ground=new Int16Array(57600).fill(-1),cv=document.createElement('canvas');
 const one=(objects:GeneratedSceneObservation['snapshot']['objects'],part:unknown,mark:'festival'|'fire'|'cart'|null,line:number)=>{
  const o2:GeneratedSceneObservation={...o,snapshot:{...o.snapshot,objects},composition:{...o.composition,residentialBlocks:blocks.map(b=>({...b,roofParts:b.roofParts.filter(p=>p===part)}))}};
  draw(cv,o2,{festival:mark==='festival',fire:mark==='fire',cart:mark==='cart'});
  const d=cv.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,320,180).data;
  for(let i=0;i<57600;i++)if(d[i*4+3])ground[i]=line;
 };
 for(const depth of ['far','middle','near'] as const)
  for(const part of blocks.flatMap(b=>b.roofParts).filter(p=>p.depth===depth).sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId)))one([],part,null,part.y);
 for(const x of [...o.snapshot.objects.filter(x=>x.civic),...o.snapshot.objects.filter(x=>!x.civic&&x.kind!=='bridge')]){
  const plot=o.ground.facilities.find(f=>f.id===x.id)!.plot;one([x],null,null,plot.y+plot.depth);
 }
 for(const mark of ['festival','fire','cart'] as const){const m=presentation[mark];if(m)one([],null,mark,m.y);}
 return ground;
}

export interface PreparedSceneFlora {
 readonly plants:readonly ScenePlant[];
 /** Plants not in front of any structure: drawn after the ground, water and clouds, before people and structures. */
 readonly behind:HTMLCanvasElement;
 /** Plants in front of a structure: drawn after the structure layer. */
 readonly front:HTMLCanvasElement;
 /** Redraws both layers with the tree crowns at that second (no-op when no crown moved). Without a time, trees stand still. */
 at(seconds?:number):void;
}
/**
 * Tints the soil of `backdrop` (already drawn) and prepares the plant layers, split against `structures` by ground line.
 * Trees sway in moving views by moving their crowns one pixel; the split is redone per pixel for every pose.
 */
export function prepareSceneFlora(backdrop:HTMLCanvasElement,structures:HTMLCanvasElement,o:GeneratedSceneObservation,source:SceneFloraSource,presentation:Presentation,draw:StructureLayerDrawer):PreparedSceneFlora {
 const physics=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),mirror=o.ground.terrain.sites[o.ground.site].render.mirrorX===true;
 const plants=planFloraScene({seed:source.seed,site:o.ground.site,patches:source.patches,views:source.views,physics,occupied:sceneOccupiedPlots(o)});
 const raster=rasterizeFlora(plants,mirror);
 const s=structures.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,320,180).data;
 // Ground lines are needed only when a plant (in any pose: crowns move by at most one pixel) can cover a structure.
 let covered=false;
 for(const it of raster.items){for(let n=0;n<it.x.length&&!covered;n++)for(const d of it.crown[n]?[-1,0,1]:[0]){const x=it.x[n]!+d;if(x>=0&&x<320&&s[(it.y[n]!*320+x)*4+3]!==0){covered=true;break;}}if(covered)break;}
 const lines=covered?structureGroundLines(o,presentation,draw):null;
 const bctx=backdrop.getContext('2d',{willReadFrequently:true})!,bimage=bctx.getImageData(0,0,320,180);
 tintFloraSoil(bimage.data,source.patches,physics,mirror);bctx.putImageData(bimage,0,0);
 const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d')!;return {c,x,image:x.createImageData(320,180)};},behind=canvas(),front=canvas();
 const work:FloraLayer={rgba:new Uint8ClampedArray(57600*4),root:new Int16Array(57600)},sway=new Int8Array(raster.trees);let pose:string|null=null;
 const at=(seconds?:number)=>{
  for(let t=0;t<raster.trees;t++)sway[t]=seconds===undefined?0:treeSwayAt(t,seconds);
  const key=sway.join(',');if(key===pose)return;pose=key;
  composeFlora(raster,sway,work);behind.image.data.fill(0);front.image.data.fill(0);
  for(let i=0;i<57600;i++){
   const root=work.root[i]!;if(root<0)continue;
   const target=s[i*4+3]!==0&&root>lines![i]!?front:behind;target.image.data.set(work.rgba.subarray(i*4,i*4+4),i*4);
  }
  behind.x.putImageData(behind.image,0,0);front.x.putImageData(front.image,0,0);
 };
 at();
 return {plants,behind:behind.c,front:front.c,at};
}
