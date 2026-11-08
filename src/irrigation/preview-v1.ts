/** A3 static comparison only. It never changes the production scene or walking policy. */
import {knownIrrigationReview,observeIrrigationReview} from './history-v1.js';
import type {IrrigationReview} from './review-types-v1.js';
import {observeGeneratedSceneReview,type GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import {drawGeneratedSceneReview,drawSceneTree,projectScenePaint,type ScenePaintProjection} from '../scene/draw-generated-review.js';
import type {RecordPoint} from '../terrain/terrain-record-types.js';
export interface IrrigationPreview {readonly observation:GeneratedSceneObservation;readonly paint:ScenePaintProjection;readonly cells:readonly RecordPoint[];readonly status:string;readonly mode:'baseline'|'irrigated'}
export function prepareIrrigationPreview(trial:IrrigationReview,year:number,siteIndex=0,mode:'baseline'|'irrigated'='irrigated'):IrrigationPreview {
 if(!['baseline','irrigated'].includes(mode))throw Error('Unknown preview mode');const source=knownIrrigationReview(trial),base=observeGeneratedSceneReview(source.world,year,siteIndex),view=mode==='irrigated'?observeIrrigationReview(trial,year,base.ground.site):undefined,ground=view?{...base.ground,environment:view.environment,vegetation:view.vegetation}:base.ground,observation={...base,ground,composition:{...base.composition,generatedGround:ground}},cells=mode==='irrigated'?(view?.geometry?.cells??[]):[],occupied=new Set(cells.map(([x,y])=>y*320+x)),raw=projectScenePaint(observation);
 const clear=(point:RecordPoint,width=2)=>[0,1].every(dy=>Array.from({length:width},(_,dx)=>!occupied.has((point[1]+dy)*320+point[0]+dx)).every(Boolean));
 const vegetation=raw.vegetation?{grass:raw.vegetation.grass.filter(p=>clear(p.point)),shrubs:raw.vegetation.shrubs.filter(p=>clear(p.point,3)),trees:raw.vegetation.trees.filter(p=>clear(p.point))}:null;
 // These are comparison scenes: do not imply that production people can cross a new canal.
 const paint={...raw,vegetation,presentation:{...raw.presentation,people:[],cart:null,wear:raw.presentation.wear.filter(([x,y])=>!occupied.has(y*320+x))}};
 return {observation,paint,cells,status:mode==='irrigated'?(view?.channel?.status??'none'):'none',mode};
}
export function drawIrrigationPreview(canvas:HTMLCanvasElement,prepared:IrrigationPreview):void {
 const {observation:o,paint,cells,status}=prepared;drawGeneratedSceneReview(canvas,o,'backdrop',paint);const c=canvas.getContext('2d');if(!c)throw Error('No preview context');c.save();if(o.ground.terrain.sites[o.ground.site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
 for(const {x,y}of paint.presentation.clouds){c.fillStyle=paint.presentation.drought?'#c4c3aa':'#e9e1cb';c.fillRect(x+4,y,19,3);c.fillRect(x,y+3,31,5);c.fillRect(x+8,y-3,10,4);}
 for(const [i,[x,y]]of cells.entries()){c.fillStyle=status==='active'?(i%7===0?'#8db6b5':'#568f9c'):status==='abandoned'?'#968766':status==='idle'?'#aa966d':i%5===0?'#71674f':'#ac8d63';c.fillRect(x,y,1,1);}
 for(const t of paint.vegetation?.trees??paint.presentation.trees)drawSceneTree(c,t.point[0],t.point[1],t.scale,0,'palette' in t?t.palette:undefined,'foliage' in t?t.foliage:undefined);
 c.restore();const structures=canvas.ownerDocument.createElement('canvas');drawGeneratedSceneReview(structures,o,'structures',paint);c.drawImage(structures,0,0);
}
