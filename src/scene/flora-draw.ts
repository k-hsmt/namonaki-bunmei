/**
 * Issue #47 B2d: the world's plants in a confirmed scene, ordered against structures by ground line (Y).
 *
 * Layer order (B1b, Human review): terrain and ground → biome soil tint → plants behind structures → people →
 * the game's structure layer (unchanged internal order) → plants in front of structures.
 * A plant pixel is in front only where it covers a structure pixel and its root y is greater than that
 * structure's ground line (a tie keeps the structure in front). The ground line of each structure pixel is
 * found by drawing every structure alone with the game's own function, in the game's own order (fields, roofs, civic, other
 * buildings: scene/structure-order); the last one drawn owns the pixel. Ground lines: facility footprint front edge (plot.y+depth), roof part base y, mark y.
 */
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {sceneFields,sceneBuildings} from './structure-order.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {planFloraScene,rasterizeFlora,composeFlora,treeSwayAt,tintFloraSoil,type FloraLayer,type ScenePlant,type ScenePlot} from '../flora/flora-scene-v1.js';
import type {FloraPatch,GroundMaterial} from '../flora/local-flora-v1.js';
import type {BiomeKind} from '../climate/initial-climate-v1.js';
import {paintGroundMaterials,toneDistantLand} from '../flora/ground-materials-v1.js';
import {paintGroundSeason,paintGroundSnow,paintStructureSnow} from '../season/season-ground-v1.js';
import type {SeasonalView} from '../season/season-presentation-v1.js';
import {describeFloraPatch} from '../flora/local-flora-v1.js';
import type {FloraPatchView} from '../flora/flora-growth-v1.js';

export interface SceneFloraSource {readonly seed:number;readonly patches:readonly (FloraPatch|null)[];readonly views:readonly (FloraPatchView|null)[];
 /** Issue #36 D1a: a forced season for development comparison only. The live game never sets it (D0 §3, §10). */
 readonly season?:SeasonalView}
/** Draws one structure-only layer of a (filtered) observation; supplied by the scene drawer. */
export type StructureLayerDrawer=(canvas:HTMLCanvasElement,o:GeneratedSceneObservation,marks:{festival:boolean;fire:boolean;cart:boolean})=>void;
type Presentation={readonly festival:{x:number;y:number}|null;readonly fire:{x:number;y:number}|null;readonly cart:{x:number;y:number}|null};

/** Standing structures' footprints (record coordinates): no plant roots there. */
export function sceneOccupiedPlots(o:GeneratedSceneObservation):ScenePlot[] {
 const live=new Set(o.snapshot.objects.filter(x=>x.kind!=='field'||x.condition!=='ruined').map(x=>x.id));
 return [...o.ground.facilities.filter(x=>live.has(x.id)).map(x=>x.plot),...o.composition.residentialBlocks.map(x=>x.footprint),
  ...(o.snapshot.publicSpaces??[]).filter(x=>x.condition==='used').map(x=>x.footprint),...o.ground.bridges.flatMap(x=>[x.deck,...x.bankSupports])];
}

/**
 * Per-pixel layout of the structure layer, from each structure drawn alone with the game's own function in the
 * game's own order (the last one drawn owns the pixel):
 * - ground: the owner's ground line (y), −1 where there is no structure;
 * - surface: 1 a field, 2 the top edge of a building or roof's own drawn shape (its pixel above is not its own),
 *   3 the pixel just below such an edge, 0 otherwise (marks, walls, nothing). Issue #36 D1b lays roof snow on 2/3.
 */
export function structureLayout(o:GeneratedSceneObservation,presentation:Presentation,draw:StructureLayerDrawer):{readonly ground:Int16Array;readonly surface:Uint8Array} {
 const blocks=o.composition.residentialBlocks,ground=new Int16Array(57600).fill(-1),surface=new Uint8Array(57600),cv=document.createElement('canvas');
 const one=(objects:GeneratedSceneObservation['snapshot']['objects'],part:unknown,mark:'festival'|'fire'|'cart'|null,line:number,kind:'field'|'building'|'mark')=>{
  const o2:GeneratedSceneObservation={...o,snapshot:{...o.snapshot,objects},composition:{...o.composition,residentialBlocks:blocks.map(b=>({...b,roofParts:b.roofParts.filter(p=>p===part)}))}};
  draw(cv,o2,{festival:mark==='festival',fire:mark==='fire',cart:mark==='cart'});
  const d=cv.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,320,180).data,own=(i:number)=>i>=0&&d[i*4+3]!==0;
  for(let i=0;i<57600;i++)if(own(i)){ground[i]=line;
   surface[i]=kind==='field'?1:kind==='mark'?0:!own(i-320)?2:!own(i-640)&&own(i-320)?3:0;}
 };
 const groundLine=(x:GeneratedSceneObservation['snapshot']['objects'][number])=>{const plot=o.ground.facilities.find(f=>f.id===x.id)!.plot;return plot.y+plot.depth;};
 for(const x of sceneFields(o.snapshot.objects))one([x],null,null,groundLine(x),'field');
 for(const depth of ['far','middle','near'] as const)
  for(const part of blocks.flatMap(b=>b.roofParts).filter(p=>p.depth===depth).sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId)))one([],part,null,part.y,'building');
 for(const x of sceneBuildings(o.snapshot.objects))one([x],null,null,groundLine(x),'building');
 for(const mark of ['festival','fire','cart'] as const){const m=presentation[mark];if(m)one([],null,mark,m.y,'mark');}
 return {ground,surface};
}
/** Ground line (y) of every screen pixel of the structure layer, −1 where there is no structure. */
export function structureGroundLines(o:GeneratedSceneObservation,presentation:Presentation,draw:StructureLayerDrawer):Int16Array {return structureLayout(o,presentation,draw).ground;}

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
 const raster=rasterizeFlora(plants,mirror,source.season);
 const s=structures.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,320,180).data;
 // Ground lines are needed only when a plant (in any pose: crowns move by at most one pixel) can cover a structure.
 let covered=false;
 for(const it of raster.items){for(let n=0;n<it.x.length&&!covered;n++)for(const d of it.crown[n]?[-1,0,1]:[0]){const x=it.x[n]!+d;if(x>=0&&x<320&&s[(it.y[n]!*320+x)*4+3]!==0){covered=true;break;}}if(covered)break;}
 const snow=source.season?.snow??0,layout=covered||snow>0?structureLayout(o,presentation,draw):null,lines=layout?.ground??null;
 // Issue #36 D1b: snow on the structures' own top edges and on fields, painted into the structure layer so that
 // plants in front still cover it. Ground snow is painted with the ground below.
 if(snow>0&&layout){const sctx=structures.getContext('2d',{willReadFrequently:true})!,img=sctx.getImageData(0,0,320,180);paintStructureSnow(img.data,layout.surface,snow,mirror);sctx.putImageData(img,0,0);}
 const bctx=backdrop.getContext('2d',{willReadFrequently:true})!,bimage=bctx.getImageData(0,0,320,180);
 // Ground: the biome tint (B2d), then each patch's material (B2d2), except on built ground, plazas and bridges.
 tintFloraSoil(bimage.data,source.patches,physics,mirror);paintGroundMaterials(bimage.data,source.patches,physics,mirror,sceneOccupiedPlots(o));
 if(source.season){paintGroundSeason(bimage.data,source.patches,physics,mirror,source.season);if(source.season.snow>0)paintGroundSnow(bimage.data,physics,mirror,source.season.snow,sceneOccupiedPlots(o));}
 toneDistant(bimage.data,o,source.patches,mirror);bctx.putImageData(bimage,0,0);
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

/** Most common value among the district's patches (the world's dominant biome and its ground, as seen here). */
function commonest<T>(values:readonly T[]):T|undefined {const n=new Map<T,number>();let best:T|undefined,top=0;for(const v of values){const c=(n.get(v)??0)+1;n.set(v,c);if(c>top){top=c;best=v;}}return best;}
/** Distant ridges, hills and plain take the near ground's tone and a faint grain (B2d2, Human review). Snow is kept. */
function toneDistant(rgba:Uint8ClampedArray,o:GeneratedSceneObservation,patches:readonly (FloraPatch|null)[],mirror:boolean){
 const views=patches.filter((p):p is FloraPatch=>p!==null).map(describeFloraPatch);if(!views.length)return;
 const biome=commonest(views.map(v=>v.biome)) as BiomeKind,material=commonest(views.filter(v=>v.biome===biome).map(v=>v.ground)) as GroundMaterial;
 const render=o.ground.terrain.sites[o.ground.site].render,layers=new Uint8Array(320*96),cv=document.createElement('canvas');cv.width=320;cv.height=96;
 const c=cv.getContext('2d',{willReadFrequently:true})!;
 for(let y=53;y<96;y++)layers.fill(1,y*320,y*320+320);
 const mark=(polygon:readonly (readonly [number,number])[],label:number)=>{
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,320,96);if(mirror)c.setTransform(-1,0,0,1,320,0);
  c.fillStyle='#000';c.beginPath();c.moveTo(polygon[0]![0],polygon[0]![1]);for(const q of polygon.slice(1))c.lineTo(q[0],q[1]);c.closePath();c.fill();
  const d=c.getImageData(0,0,320,96).data;for(let k=0;k<320*96;k++)if(d[k*4+3]!>=128)layers[k]=label;
 };
 render.far.forEach((p,n)=>mark(p,2+n));for(const p of render.middle)mark(p,255);
 const keep=new Uint8Array(320*96);
 for(let k=0;k<320*96;k++){const i=k*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];if((r===0xe1&&g===0xe5&&b===0xd9)||(r===0xcd&&g===0xd6&&b===0xce))keep[k]=1;}
 // The near ground as drawn (tint and materials), on stable land within 24 px of the horizon.
 const physics=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),sum=[0,0,0];let n=0;
 for(let y=96;y<120;y++)for(let x=0;x<320;x++){const z=y*320+(mirror?319-x:x);if(physics.surface[z]!==1||physics.bearing[z]!==0)continue;for(let j=0;j<3;j++)sum[j]=sum[j]!+rgba[(y*320+x)*4+j]!;n++;}
 if(!n)return;
 toneDistantLand(rgba,layers,sum.map(v=>v/n) as [number,number,number],[0xbd,0xc9,0xbb],material,render.far.length,keep);
}
