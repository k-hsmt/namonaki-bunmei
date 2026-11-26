/**
 * Issue #39 D2: which recorded target owns each visible pixel of the still 320×180 scene (D0 §6).
 *
 * The scene is the composition of layers (drawGeneratedSceneReview with the world's flora): backdrop (ground, canal,
 * bridges), clouds, plants behind, people, structures, plants in front, animals. A target owns a pixel when
 *  1. it is the topmost thing of its own layer there — the layer drawn without that target differs at that pixel
 *     (the drawing code itself decides, no colour guessing, no rectangles), and
 *  2. no later layer covers the pixel in the still frame.
 * A pixel two targets both claim is a conflict and is resolved by an explicit choice, never silently.
 * Read-only: the mask is a cache of the observation; nothing is drawn on the scene canvas and nothing is saved.
 */
import {observeGeneratedWorldSession,worldStructurePainter,type ArchitectureGeneratedSession} from '../story/world-session.js';
import {drawGeneratedSceneReview,projectScenePaint,withoutLandscapePlants,sceneStructureDrawer,drawClouds,drawPeople,type ScenePaintProjection} from './draw-generated-review.js';
import {prepareSceneFlora} from './flora-draw.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import type {HistoricalTargetRef} from '../story/historical-records.js';

const W=320,H=180,N=W*H;
export const PICK_NONE=-1,PICK_CONFLICT=-2;
export interface PickMask {
 readonly year:number;readonly siteIndex:number;
 /** Targets drawn in this frame, in drawing-layer order (index = owner id). */
 readonly targets:readonly HistoricalTargetRef[];
 /** Owner of each screen pixel: a target index, PICK_NONE or PICK_CONFLICT. */
 readonly owners:Int16Array;
 /** Visible pixels per target (0: drawn but fully covered). */
 readonly visiblePixels:readonly number[];
 /** Owners of each conflict pixel. */
 readonly conflicts:ReadonlyMap<number,readonly number[]>;
 /** The still frame recomposed from the same layers (tests compare it with the live still frame). */
 readonly composed:HTMLCanvasElement;
}
const blank=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;};
const pixels=(c:HTMLCanvasElement)=>c.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,W,H).data;
const copy=(c:HTMLCanvasElement)=>{const d=blank();d.getContext('2d')!.drawImage(c,0,0);return d;};
const differs=(a:Uint8ClampedArray,b:Uint8ClampedArray,i:number)=>a[i*4]!==b[i*4]||a[i*4+1]!==b[i*4+1]||a[i*4+2]!==b[i*4+2]||a[i*4+3]!==b[i*4+3];

/** Builds the pick mask of a v10 world's still scene in a confirmed year and site. */
export function buildPickMask(session:ArchitectureGeneratedSession,year:number,siteIndex:number):PickMask {
 const painter=worldStructurePainter(session);if(!painter?.flora)throw Error('pick mask: the live painter is required');
 const o=observeGeneratedWorldSession(session,year,siteIndex),paint=withoutLandscapePlants(projectScenePaint(o));
 const layer=(obs:GeneratedSceneObservation,which:'backdrop'|'structures')=>{const c=blank();
  drawGeneratedSceneReview(c,obs,which,obs===o?paint:{...paint,observation:obs} as ScenePaintProjection,painter);return c;};
 const mirrored=(draw:(c:CanvasRenderingContext2D)=>void)=>{const c=blank(),x=c.getContext('2d')!;x.save();if(o.ground.terrain.sites[o.ground.site].render.mirrorX){x.translate(W,0);x.scale(-1,1);}draw(x);x.restore();return c;};
 // the layers exactly as the still frame composes them (drawGeneratedSceneReview, painter.flora branch)
 const backdrop=layer(o,'backdrop'),structures=layer(o,'structures');
 const tinted=copy(backdrop),snowy=copy(structures);
 const flora=prepareSceneFlora(tinted,snowy,o,painter.flora(o),paint.presentation,sceneStructureDrawer(paint,painter));
 const clouds=mirrored(c=>drawClouds(c,paint.presentation)),people=mirrored(c=>drawPeople(c,paint.presentation));
 const fauna=blank();painter.fauna?.(o,{structures:snowy,flora}).draw(fauna,0,false);
 const composed=copy(tinted),cc=composed.getContext('2d')!;
 for(const c of [clouds,flora.behind,people,snowy,flora.front,fauna])cc.drawImage(c,0,0);
 // what covers each layer in the still frame
 const alpha=(c:HTMLCanvasElement)=>pixels(c);
 const above={structures:[alpha(flora.front),alpha(fauna)],backdrop:[alpha(clouds),alpha(flora.behind),alpha(people),alpha(snowy),alpha(flora.front),alpha(fauna)]};
 const covered=(list:readonly Uint8ClampedArray[],i:number)=>list.some(a=>a[i*4+3]!==0);
 // each target and the same layer drawn without it
 const targets:HistoricalTargetRef[]=[],layers:{which:'backdrop'|'structures';without:GeneratedSceneObservation}[]=[];
 const s=o.snapshot,scene=o.composition,ground=o.ground;
 for(const x of s.objects){if(x.kind==='field'||x.kind==='bridge')continue;
  targets.push({kind:'facility',id:x.id});layers.push({which:'structures',without:{...o,snapshot:{...s,objects:s.objects.filter(y=>y!==x)}}});}
 for(const b of scene.residentialBlocks??[]){
  targets.push({kind:'housing-block',blockId:b.blockId});layers.push({which:'structures',without:{...o,composition:{...scene,residentialBlocks:scene.residentialBlocks.filter(y=>y!==b)}}});}
 const withGround=(g:typeof ground):GeneratedSceneObservation=>({...o,ground:g,composition:{...scene,generatedGround:g}});
 for(const g of ground.bridges){targets.push({kind:'bridge',id:g.bridgeId});layers.push({which:'backdrop',without:withGround({...ground,bridges:ground.bridges.filter(y=>y!==g)})});}
 const view=ground.channelView;
 if(view?.geometry&&view.channel){targets.push({kind:'waterway',systemId:view.channel.id});layers.push({which:'backdrop',without:withGround({...ground,channelView:{...view,geometry:null}})});}
 const full={backdrop:pixels(backdrop),structures:pixels(structures)};
 const owners=new Int16Array(N).fill(PICK_NONE),conflicts=new Map<number,number[]>(),visiblePixels=targets.map(()=>0);
 layers.forEach(({which,without},t)=>{
  const a=full[which],b=pixels(layer(without,which));
  for(let i=0;i<N;i++){
   if(!differs(a,b,i)||covered(above[which],i))continue;
   const current=owners[i]!;
   if(current===PICK_NONE){owners[i]=t;visiblePixels[t]!++;continue;}
   const list=current===PICK_CONFLICT?conflicts.get(i)!:[current];
   if(current!==PICK_CONFLICT){visiblePixels[current]!--;owners[i]=PICK_CONFLICT;conflicts.set(i,list);}
   list.push(t);
  }
 });
 return {year,siteIndex,targets,owners,visiblePixels,conflicts,composed};
}

/**
 * Targets at a screen pixel. `radius` 0 is the exact pixel; a touch passes a few pixels so that a tiny target can be
 * reached. Nearest first; a conflict pixel yields all its owners. Pixels outside the canvas yield nothing.
 */
export function pickAt(mask:PickMask,x:number,y:number,radius=0):readonly number[] {
 if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(radius)||radius<0)throw Error('pick: invalid point');
 const best=new Map<number,number>();
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
  const px=x+dx,py=y+dy,d=dx*dx+dy*dy;if(px<0||px>=W||py<0||py>=H||d>radius*radius)continue;
  const i=py*W+px,o=mask.owners[i]!;if(o===PICK_NONE)continue;
  for(const t of o===PICK_CONFLICT?mask.conflicts.get(i)!:[o])if(!best.has(t)||best.get(t)!>d)best.set(t,d);
 }
 return [...best].sort((a,b)=>a[1]-b[1]||a[0]-b[0]).map(([t])=>t);
}
/** Screen pixels of one target (for the outline drawn on the separate annotation layer). */
export function targetPixels(mask:PickMask,target:number):readonly number[] {
 const out:number[]=[];
 for(let i=0;i<N;i++){const o=mask.owners[i]!;if(o===target||o===PICK_CONFLICT&&mask.conflicts.get(i)!.includes(target))out.push(i);}
 return out;
}
