/** D4-A saved terrain + confirmed structures. Legacy scenery remains separate. */
import {projectVegetation} from '../vegetation/presentation-v1.js';
import {drawTerrainRecord} from '../terrain/draw-terrain-record-v1.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {drawBuildingSprite,drawCivicArchitecture,drawHousingPlotSurface,drawResidentialRoofs,drawConfirmedPublicSpaces} from './draw.js';
import {projectGeneratedPresentation} from './generated-presentation-review.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
/** Ground-level paint is clipped to the actual footprint; upper roofs may overhang. */
function withinFootprint(c:CanvasRenderingContext2D,p:GroundPlot,draw:()=>void){
 c.save();c.beginPath();c.rect(0,0,320,p.y);c.rect(p.x,p.y,p.width,p.depth);c.clip();draw();c.restore();
}
export function drawSceneTree(c:CanvasRenderingContext2D,x:number,y:number,k:number,sway=0):void {
  const h=Math.round(9*k),w=Math.round(7*k);c.fillStyle='#625745';c.fillRect(x,y-h,2,h+2);
  x+=sway;c.fillStyle='#607b57';c.fillRect(x-w,y-h-8,2*w+2,7);c.fillStyle='#77916a';c.fillRect(x-w-2,y-h-5,w+2,6);
  c.fillStyle='#4d7055';c.fillRect(x+2,y-h-5,w+1,5);
}
export function projectScenePaint(observation:GeneratedSceneObservation){return {observation,presentation:projectGeneratedPresentation(observation),vegetation:observation.ground.vegetation?projectVegetation(observation):null};}
export type ScenePaintProjection=ReturnType<typeof projectScenePaint>;
export type GeneratedSceneLayer='backdrop'|'structures';
export function drawGeneratedSceneReview(canvas:HTMLCanvasElement,observation:GeneratedSceneObservation,layer?:GeneratedSceneLayer,paint?:ScenePaintProjection):void {
 if(layer!==undefined&&layer!=='backdrop'&&layer!=='structures')throw Error('Unknown scene layer');
 if(paint&&paint.observation!==observation)throw Error('Scene paint projection mismatch');
 const {snapshot:s,composition:scene,ground}=observation;
 if(scene.generatedGround!==ground||scene.year!==s.year||scene.siteIndex!==(s.local?.index??0))throw Error('Generated scene composition mismatch');
 if(layer==='structures'){canvas.width=320;canvas.height=180;}else drawTerrainRecord(canvas,ground.terrain,ground.site);const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');
 c.save();if(ground.terrain.sites[ground.site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
 const {presentation,vegetation}=paint??projectScenePaint(observation),r=readOwnedRecordPhysics(ground.terrain.sites[ground.site].physics);
 if(!layer)for(const {x,y} of presentation.clouds){c.fillStyle=presentation.drought?'#c4c3aa':'#e9e1cb';c.fillRect(x+4,y,19,3);c.fillRect(x,y+3,31,5);c.fillRect(x+8,y-3,10,4);}
 // Weather paints only the saved surface type; floods never invent new water.
 if(layer!=='structures'&&(presentation.flood||presentation.drought))for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x;
  if(presentation.flood&&r.surface[i]===2){c.fillStyle='#6296a0';c.fillRect(x,y,1,1);}
  else if(presentation.drought&&r.surface[i]===1&&(x*7+y*13)%43===0){c.fillStyle='#b2a278';c.fillRect(x,y,1,1);}
 }
 if(vegetation&&layer!=='structures'){
  for(const {point:[x,y],color} of vegetation.grass){c.fillStyle=color;c.fillRect(x,y,1,1);}
  for(const {point:[x,y]} of vegetation.shrubs){c.fillStyle='#718866';c.fillRect(x,y-2,3,2);c.fillStyle='#84956c';c.fillRect(x+1,y-3,2,2);}
 }
 if(!layer)for(const {point:[x,y],scale:k} of vegetation?.trees??presentation.trees)drawSceneTree(c,x,y,k);
 if(layer!=='structures'){
 c.fillStyle=presentation.drought?'#aa9b77':'#b1a180';for(const [x,y] of presentation.wear)c.fillRect(x,y,1,1);
 drawConfirmedPublicSpaces(c,s.publicSpaces??[]);drawHousingPlotSurface(c,scene);
 }
 if(layer!=='backdrop')for(const depth of ['far','middle','near'] as const)drawResidentialRoofs(c,scene,depth);
 if(!layer)for(const [i,[x,y]] of presentation.people.entries()){
  c.fillStyle='#d2b894';c.fillRect(x,y-6,2,2);c.fillStyle=['#66594f','#b29b74','#667a70'][i%3]!;c.fillRect(x,y-4,2,3);c.fillStyle='#454e48';c.fillRect(x,y-1,2,2);
 }
 if(layer!=='backdrop')for(const o of [...s.objects.filter(o=>o.civic),...s.objects.filter(o=>!o.civic&&o.kind!=='bridge')]){
  const f=ground.facilities.find(p=>p.id===o.id)!.plot;
  withinFootprint(c,f,()=>{
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
 }
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
