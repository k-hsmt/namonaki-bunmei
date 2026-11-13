import {paintTerrainCutSurface} from '../terrain/draw-terrain-cut-v1.js';
import {channelMask,clearChannelRoot,drawProductionCanal} from '../irrigation/presentation-v1.js';
import type {Foliage} from '../environment/landscape-v3.js';
import type {LeafPalette} from '../environment/landscape-v2.js';
import {paintEnvironmentGround} from '../environment/presentation-v1.js';
/** D4-A saved terrain + confirmed structures. Legacy scenery remains separate. */
import {projectVegetation,type TreePaint} from '../vegetation/presentation-v1.js';
import {drawTerrainRecord} from '../terrain/draw-terrain-record-v1.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {drawBuildingSprite,drawCivicArchitecture,drawHousingPlotSurface,drawResidentialRoofs,drawConfirmedPublicSpaces} from './draw.js';
import {projectGeneratedPresentation} from './generated-presentation-review.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {sceneFields,sceneBuildings} from './structure-order.js';
import {prepareSceneFlora,type SceneFloraSource,type StructureLayerDrawer} from './flora-draw.js';
/** Ground-level paint is clipped to the actual footprint; upper roofs may overhang. */
function withinFootprint(c:CanvasRenderingContext2D,p:GroundPlot,draw:()=>void){
 c.save();c.beginPath();c.rect(0,0,320,p.y);c.rect(p.x,p.y,p.width,p.depth);c.clip();draw();c.restore();
}
export function drawSceneTree(c:CanvasRenderingContext2D,x:number,y:number,k:number,sway=0,palette?:LeafPalette,foliage?:Foliage):void {
 if(palette&&foliage&&foliage!=='full'){
  const h=Math.max(3,Math.round(10*k)),w=Math.max(2,Math.round(7*k)),leaves=Math.max(3,Math.round(8*k)),top=y-h-leaves;
  c.fillStyle='#625745';c.fillRect(x,y-h,2,h+2);c.fillRect(x,top+2,1,leaves);const crown=x+sway;
  // Exposed branches stay above the verified two-pixel root.
  for(const side of [-1,1])for(let i=1;i<=w;i++)c.fillRect(crown+side*i,top+2+Math.floor(i*.7),1,1);
  c.fillRect(crown-1,top,1,3);
  if(foliage==='bare'){c.fillStyle='#d9ded0';c.fillRect(crown-1,top,2,1);return;}
  c.fillStyle=palette[2];c.fillRect(crown-w,top+2,Math.max(2,w-1),2);c.fillRect(crown+1,top+4,w,2);
  c.fillStyle=palette[0];c.fillRect(crown-2,top,3,2);c.fillStyle=palette[1];c.fillRect(crown-w,top+1,Math.max(2,w-1),1);
  if(foliage==='lush'){c.fillStyle=palette[2];c.fillRect(crown-w-1,top+2,w*2+2,leaves);c.fillStyle=palette[0];c.fillRect(crown-w,top,w*2,leaves);c.fillStyle=palette[1];c.fillRect(crown-w+1,top-1,w+1,Math.max(2,leaves-2));}
  return;
 }
 if(palette){const h=Math.round(10*k),w=Math.max(2,Math.round(7*k)),leaves=Math.max(3,Math.round(8*k));c.fillStyle='#625745';c.fillRect(x,y-h,2,h+2);c.fillRect(x-1,y-h+1,1,2);x+=sway;c.fillStyle=palette[2];c.fillRect(x-w+1,y-h-leaves+2,w*2,leaves-1);c.fillStyle=palette[0];c.fillRect(x-w,y-h-leaves+1,w*2-1,leaves-1);c.fillStyle=palette[1];c.fillRect(x-w+1,y-h-leaves,w+1,Math.max(2,leaves-2));c.fillStyle=palette[0];c.fillRect(x-w-1,y-h-leaves+Math.floor(leaves/2),w+1,Math.ceil(leaves/2));return;}

  const h=Math.round(9*k),w=Math.round(7*k);c.fillStyle='#625745';c.fillRect(x,y-h,2,h+2);
  x+=sway;c.fillStyle='#607b57';c.fillRect(x-w,y-h-8,2*w+2,7);c.fillStyle='#77916a';c.fillRect(x-w-2,y-h-5,w+2,6);
  c.fillStyle='#4d7055';c.fillRect(x+2,y-h-5,w+1,5);
}
export function projectScenePaint(observation:GeneratedSceneObservation){
 const presentation=projectGeneratedPresentation(observation),raw=observation.ground.vegetation?projectVegetation(observation):null,mask=channelMask(observation.ground.channelView);
 const clear=(p:{point:readonly [number,number]},width=2)=>clearChannelRoot(mask,p.point[0],p.point[1],width);
 return {observation,presentation:mask?{...presentation,trees:presentation.trees.filter(p=>clear(p)),wear:presentation.wear.filter(([x,y])=>clearChannelRoot(mask,x,y,1,1)),people:presentation.people.filter(([x,y])=>clearChannelRoot(mask,x,y))}:presentation,vegetation:mask&&raw?{...raw,grass:raw.grass.filter(p=>clear(p)),shrubs:raw.shrubs.filter(p=>clear(p,3)),trees:raw.trees.filter(p=>clear(p))}:raw};
}
export type ScenePaintProjection=ReturnType<typeof projectScenePaint>;
/** Issue #47 B2d: with the world's flora, the landscape-v3 grass, shrubs and trees are not drawn (fields keep their #32 rule). */
export function withoutLandscapePlants(paint:ScenePaintProjection):ScenePaintProjection {
 return {...paint,presentation:{...paint.presentation,trees:[]},vegetation:paint.vegetation?{...paint.vegetation,grass:[],shrubs:[],trees:[]}:null};
}
function drawClouds(c:CanvasRenderingContext2D,presentation:ScenePaintProjection['presentation']){for(const {x,y} of presentation.clouds){c.fillStyle=presentation.drought?'#c4c3aa':'#e9e1cb';c.fillRect(x+4,y,19,3);c.fillRect(x,y+3,31,5);c.fillRect(x+8,y-3,10,4);}}
function drawPeople(c:CanvasRenderingContext2D,presentation:ScenePaintProjection['presentation']){for(const [i,[x,y]] of presentation.people.entries()){
 c.fillStyle='#d2b894';c.fillRect(x,y-6,2,2);c.fillStyle=['#66594f','#b29b74','#667a70'][i%3]!;c.fillRect(x,y-4,2,3);c.fillStyle='#454e48';c.fillRect(x,y-1,2,2);
}}
/** Draws a structure-only layer of a filtered observation with one scene's presentation (for the plant/structure Y order). */
export function sceneStructureDrawer(paint:ScenePaintProjection,painter?:GeneratedStructurePainter):StructureLayerDrawer {
 const p=paint.presentation;
 return (canvas,o,marks)=>drawGeneratedSceneReview(canvas,o,'structures',{observation:o,presentation:{...p,trees:[],festival:marks.festival?p.festival:null,fire:marks.fire?p.fire:null,cart:marks.cart?p.cart:null},vegetation:paint.vegetation},painter);
}
export type GeneratedSceneLayer='backdrop'|'structures';
/**
 * Optional replacement for how housing parts and facilities are painted (Issue #35 D2-c review only).
 * Absent, the scene is drawn exactly as before. A facility painter returns false to fall back to the
 * live sprite. Called inside the same mirroring and footprint clip as the live drawing.
 */
export interface GeneratedStructurePainter {
 readonly residentialRoofs?:(c:CanvasRenderingContext2D,scene:GeneratedSceneObservation['composition'],depth:'far'|'middle'|'near')=>void;
 readonly facility?:(c:CanvasRenderingContext2D,o:GeneratedSceneObservation['snapshot']['objects'][number],plot:GroundPlot,year:number)=>boolean;
 /** Issue #47 B2d (v10 worlds): the world's flora of the observed year and site. Present, plants follow it. */
 readonly flora?:(o:GeneratedSceneObservation)=>SceneFloraSource;
}
export function drawGeneratedSceneReview(canvas:HTMLCanvasElement,observation:GeneratedSceneObservation,layer?:GeneratedSceneLayer,paint?:ScenePaintProjection,painter?:GeneratedStructurePainter):void {
 if(layer!==undefined&&layer!=='backdrop'&&layer!=='structures')throw Error('Unknown scene layer');
 if(paint&&paint.observation!==observation)throw Error('Scene paint projection mismatch');
 const {snapshot:s,composition:scene,ground}=observation;
 if(scene.generatedGround!==ground||scene.year!==s.year||scene.siteIndex!==(s.local?.index??0))throw Error('Generated scene composition mismatch');
 if(painter?.flora){
  paint=withoutLandscapePlants(paint??projectScenePaint(observation));
  if(!layer){
   // Same composition as the motion frame (trees still): tinted backdrop, clouds, plants behind, people, structures, plants in front.
   drawGeneratedSceneReview(canvas,observation,'backdrop',paint,painter);
   const structures=document.createElement('canvas');drawGeneratedSceneReview(structures,observation,'structures',paint,painter);
   const flora=prepareSceneFlora(canvas,structures,observation,painter.flora(observation),paint.presentation,sceneStructureDrawer(paint,painter));
   const c=canvas.getContext('2d')!;c.save();if(ground.terrain.sites[ground.site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
   drawClouds(c,paint.presentation);c.restore();c.drawImage(flora.behind,0,0);c.save();if(ground.terrain.sites[ground.site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}drawPeople(c,paint.presentation);c.restore();
   c.drawImage(structures,0,0);c.drawImage(flora.front,0,0);return;
  }
 }
 if(layer==='structures'){canvas.width=320;canvas.height=180;}else drawTerrainRecord(canvas,ground.terrain,ground.site);const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');
 c.save();if(ground.terrain.sites[ground.site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
 if(layer!=='structures'){paintEnvironmentGround(c,ground);if(ground.terrain.format==='resolved-terrain-at-year')paintTerrainCutSurface(c,ground.terrain,ground.site);}
 const {presentation,vegetation}=paint??projectScenePaint(observation),r=readOwnedRecordPhysics(ground.terrain.sites[ground.site].physics);
 if(!layer)drawClouds(c,presentation);
 // Weather paints only the saved surface type; floods never invent new water.
 if(layer!=='structures'&&(presentation.flood||presentation.drought))for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x;
  if(presentation.flood&&r.surface[i]===2){c.fillStyle='#6296a0';c.fillRect(x,y,1,1);}
  else if(presentation.drought&&r.surface[i]===1&&(x*7+y*13)%43===0){c.fillStyle='#b2a278';c.fillRect(x,y,1,1);}
 }
 if(vegetation&&layer!=='structures'){
  for(const mark of vegetation.grass){const [x,y]=mark.point;c.fillStyle=mark.color;if(mark.height!==undefined&&mark.height>1){c.fillRect(x,y-mark.height+1,1,mark.height);c.fillRect(x+1,y-1,1,2);}else c.fillRect(x,y,1,1);}
  for(const mark of vegetation.shrubs){const [x,y]=mark.point;if(mark.foliage==='bare'||mark.foliage==='sparse'){c.fillStyle='#8c8063';c.fillRect(x,y-3,1,4);c.fillRect(x+1,y-2,2,1);if(mark.foliage==='sparse'){c.fillStyle=mark.palette![0];c.fillRect(x+1,y-3,2,1);}continue;}if(mark.palette!==undefined){c.fillStyle=mark.palette[2];c.fillRect(x,y-2,3,3);c.fillStyle=mark.palette[0];c.fillRect(x-1,y-3,4,2);c.fillStyle=mark.palette[1];c.fillRect(x,y-4,2,2);continue;}c.fillStyle='#718866';c.fillRect(x,y-2,3,2);c.fillStyle='#84956c';c.fillRect(x+1,y-3,2,2);}
 }
 if(layer!=='structures')drawProductionCanal(c,ground.channelView);
 if(!layer)for(const t of (vegetation?.trees??presentation.trees) as readonly TreePaint[])drawSceneTree(c,t.point[0],t.point[1],t.scale,0,t.palette,t.foliage);
 if(layer!=='structures'){
 c.fillStyle=presentation.drought?'#aa9b77':'#b1a180';for(const [x,y] of presentation.wear)c.fillRect(x,y,1,1);
 drawConfirmedPublicSpaces(c,s.publicSpaces??[]);drawHousingPlotSurface(c,scene);
 }
 const facility=(o:typeof s.objects[number])=>{
  const f=ground.facilities.find(p=>p.id===o.id)!.plot;
  withinFootprint(c,f,()=>{
   if(painter?.facility?.(c,o,f,s.year))return;
   if(o.civic){drawCivicArchitecture(c,o);return;}
   if(o.kind==='field'){
    if(vegetation&&o.condition==='ruined')return;
    c.fillStyle=o.condition==='ruined'?'#8b9077':'#ad996e';c.fillRect(f.x,f.y,f.width,f.depth);
    c.fillStyle=presentation.drought?'#ab9c64':o.condition==='intact'?'#607748':'#8a8764';for(let x=f.x+2;x<f.x+f.width-1;x+=5)c.fillRect(x,f.y+1,2,f.depth-2);return;
   }
   if(o.kind==='market'&&o.condition!=='ruined'){
    c.fillStyle='#ad7c5c';c.beginPath();c.moveTo(o.x-19,o.y-13);c.lineTo(o.x,o.y-21);c.lineTo(o.x+19,o.y-13);c.closePath();c.fill();
    c.fillStyle='#97765e';c.fillRect(o.x-16,o.y-13,33,4);c.fillStyle='#70594b';for(const dx of [-13,0,13])c.fillRect(o.x+dx,o.y-9,2,15);
   }else drawBuildingSprite(c,o,o.kind==='hall'||o.kind==='granary');
   if(o.condition==='damaged'){c.fillStyle='#454e48';c.fillRect(o.x-6,o.y-2,6,2);}
  });
 };
 // Fields lie flat on their own footprint, so they come first: a later field would paint over the upper part of a
 // roof or building standing in front of it (Issue #47 B3 review). Then roofs, people, civic and other buildings.
 if(layer!=='backdrop')for(const o of sceneFields(s.objects))facility(o);
 if(layer!=='backdrop')for(const depth of ['far','middle','near'] as const)(painter?.residentialRoofs??drawResidentialRoofs)(c,scene,depth);
 if(!layer)drawPeople(c,presentation);
 if(layer!=='backdrop')for(const o of sceneBuildings(s.objects))facility(o);
 if(layer!=='structures')for(const g of ground.bridges){
  const o=s.objects.find(b=>b.id===g.bridgeId)!;const p=g.deck;c.fillStyle='#70594b';
  for(const support of g.bankSupports)c.fillRect(support.x,support.y,support.width,support.depth);
  if(o.condition==='intact'){
   c.fillStyle='#b39a72';c.fillRect(p.x,p.y,p.width,p.depth);c.fillStyle='#70594b';c.fillRect(p.x,p.y,p.width,1);
   for(let x=p.x+3;x<p.x+p.width;x+=6)c.fillRect(x,p.y,1,p.depth);
  }else{
   // A visibly broken span cannot imply the closed walking route is usable.
   for(const x of [p.x,p.x+p.width-8])c.fillRect(x,p.y,8,p.depth);
  }
 }
 if(layer!=='backdrop'&&presentation.festival){const {x,y}=presentation.festival;for(let i=-1;i<=1;i++){c.fillStyle=i%2?'#b98160':'#ddc482';c.fillRect(x+i*5,y-Math.abs(i),3,2);}}
 if(layer!=='backdrop'&&presentation.fire){const {x,y}=presentation.fire;c.fillStyle='#bd7557';c.fillRect(x-1,y-8,3,7);c.fillStyle='#e6bc72';c.fillRect(x,y-10,1,7);}
 if(layer!=='backdrop'&&presentation.cart){const {x,y}=presentation.cart;c.fillStyle='#8b6950';c.fillRect(x,y-2,10,4);c.fillStyle='#454e48';c.fillRect(x+1,y+2,2,2);c.fillRect(x+7,y+2,2,2);}
 c.restore();
}
