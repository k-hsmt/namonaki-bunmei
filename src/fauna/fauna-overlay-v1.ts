/**
 * Issue #38 D1c PROTOTYPE: animals drawn over a confirmed scene (development comparison only).
 *
 * The live game never loads this module (D0 §13: no live connection before the Human review of D1c). It reads the
 * observation and the live painter, plans the animals with fauna-habitat-v1, moves them with fauna-scene-v1, and paints
 * them over an already drawn frame (the live still image or a live moving-view frame).
 *
 * Depth (D0 §9) uses the live plants' rule (scene/flora-draw.ts): an animal pixel is hidden where a structure pixel's
 * ground line is at or in front of the animal's feet (a tie keeps the structure in front), or where a plant pixel's
 * root is in front of them. Plant roots follow the crowns' sway at the same second, so a swaying crown in front still
 * covers the animal. Nothing is saved, and the frame below is only painted over.
 */
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import {projectScenePaint,withoutLandscapePlants,sceneStructureDrawer,drawGeneratedSceneReview,type GeneratedStructurePainter} from '../scene/draw-generated-review.js';
import {structureLayout,sceneOccupiedPlots} from '../scene/flora-draw.js';
import {planFloraScene,rasterizeFlora,composeFlora,treeSwayAt,type FloraLayer} from '../flora/flora-scene-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {planFaunaAppearance,type FaunaHabitatYear,type FaunaAppearancePlan} from './fauna-habitat-v1.js';
import {faunaSceneLoops,faunaSceneAt,type FaunaSceneState,type FaunaSceneLoop} from './fauna-scene-v1.js';
import {faunaSprite} from './fauna-sprites-v1.js';

/** The habitat input of an observation (null without the world's flora: fail closed, D0 §4). */
export function faunaHabitatInput(o:GeneratedSceneObservation,painter:GeneratedStructurePainter|undefined):FaunaHabitatYear|null {
 const source=painter?.flora?.(o);if(!source)return null;
 const physics=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics);
 return {seed:source.seed,site:o.ground.site,year:o.snapshot.year,surface:physics.surface,grade:physics.grade,patches:source.patches,views:source.views,
  standing:sceneOccupiedPlots(o),population:o.composition.population};
}

export interface FaunaOverlayStats {readonly animals:number;readonly drawn:number;readonly hiddenByStructures:number;readonly hiddenByPlants:number}
export interface FaunaOverlay {
 readonly plan:FaunaAppearancePlan|null;
 /** The members' loops (a loop of one segment holds the planned pose: its moves did not fit that year's ground). */
 readonly loops:readonly FaunaSceneLoop[];
 /** The animals at a second (record coordinates); the still image is seconds 0. */
 at(seconds:number):readonly FaunaSceneState[];
 /** Paints the animals of `seconds` over `canvas` (already holding the frame). `sway` false: crowns stand still (still image). */
 draw(canvas:HTMLCanvasElement,seconds:number,sway:boolean):FaunaOverlayStats;
}
const rgb=(c:string)=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)] as const;

export function prepareFaunaOverlay(o:GeneratedSceneObservation,painter:GeneratedStructurePainter|undefined):FaunaOverlay {
 const input=faunaHabitatInput(o,painter);
 if(!input||!painter?.flora)return {plan:null,loops:[],at:()=>[],draw:()=>({animals:0,drawn:0,hiddenByStructures:0,hiddenByPlants:0})};
 const plan=planFaunaAppearance(input),loops=faunaSceneLoops(plan,input),mirror=o.ground.terrain.sites[o.ground.site].render.mirrorX===true;
 // the structure layer as the live scene draws it, and (only if an animal ever lands on it) each pixel's ground line
 const paint=withoutLandscapePlants(projectScenePaint(o)),structures=document.createElement('canvas');
 drawGeneratedSceneReview(structures,o,'structures',paint,painter);
 const alpha=structures.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,320,180).data;
 let lines:Int16Array|null=null;
 const groundLine=(i:number)=>{if(!lines)lines=structureLayout(o,paint.presentation,sceneStructureDrawer(paint,painter)).ground;return lines[i]!;};
 // the live planting of the year, as prepareSceneFlora plants it (reclaimed plants included)
 const source=painter.flora(o),physics=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics);
 const planted=planFloraScene({seed:source.seed,site:o.ground.site,patches:source.patches,views:source.views,physics,occupied:sceneOccupiedPlots(o)});
 const reclaimed=source.reclaim?.(planted)??[],raster=rasterizeFlora(reclaimed.length?[...planted,...reclaimed]:planted,mirror,source.season);
 const work:FloraLayer={rgba:new Uint8ClampedArray(57600*4),root:new Int16Array(57600)},sway=new Int8Array(raster.trees);let pose:string|null=null;
 const roots=(seconds:number|undefined)=>{
  for(let t=0;t<raster.trees;t++)sway[t]=seconds===undefined?0:treeSwayAt(t,seconds);
  const key=sway.join(',');if(key!==pose){composeFlora(raster,sway,work);pose=key;}return work.root;
 };
 const at=(seconds:number)=>faunaSceneAt(loops,seconds);
 const draw=(canvas:HTMLCanvasElement,seconds:number,moving:boolean):FaunaOverlayStats=>{
  const states=at(seconds),root=roots(moving?seconds:undefined),g=canvas.getContext('2d',{willReadFrequently:true})!,image=g.getImageData(0,0,320,180),d=image.data;
  let drawn=0,byStructure=0,byPlant=0;
  for(const s of [...states].sort((a,b)=>a.y-b.y||a.x-b.x)){
   for(const r of faunaSprite(s.kind,s.size,s.pose,s.frame)){
    const [cr,cg,cb]=rgb(r.color);
    for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++){
     const rx=s.facing===1?s.x+r.x+dx:s.x-r.x-dx,y=s.y+r.y+dy,x=mirror?319-rx:rx;
     if(x<0||x>=320||y<0||y>=180)continue;
     const i=y*320+x;
     if(alpha[i*4+3]!==0&&groundLine(i)>=s.y){byStructure++;continue;}
     if(root[i]!>=0&&root[i]!>s.y){byPlant++;continue;}
     d[i*4]=cr;d[i*4+1]=cg;d[i*4+2]=cb;d[i*4+3]=255;drawn++;
    }
   }
  }
  g.putImageData(image,0,0);
  return {animals:states.length,drawn,hiddenByStructures:byStructure,hiddenByPlants:byPlant};
 };
 return {plan,loops,at,draw};
}
