/** D4-A saved terrain + confirmed structures. Legacy scenery remains separate. */
import {drawTerrainRecord} from '../terrain/draw-terrain-record-v1.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {drawBuildingSprite,drawCivicArchitecture,drawHousingPlotSurface,drawResidentialRoofs,drawConfirmedPublicSpaces} from './draw.js';
/** Ground-level paint is clipped to the actual footprint; upper roofs may overhang. */
function withinFootprint(c:CanvasRenderingContext2D,p:GroundPlot,draw:()=>void){
 c.save();c.beginPath();c.rect(0,0,320,p.y);c.rect(p.x,p.y,p.width,p.depth);c.clip();draw();c.restore();
}
export function drawGeneratedSceneReview(canvas:HTMLCanvasElement,observation:GeneratedSceneObservation):void {
 const {snapshot:s,composition:scene,ground}=observation;
 if(scene.generatedGround!==ground||scene.year!==s.year||scene.siteIndex!==(s.local?.index??0))throw Error('Generated scene composition mismatch');
 drawTerrainRecord(canvas,ground.terrain,ground.site);const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');
 c.save();if(ground.terrain.sites[ground.site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
 drawConfirmedPublicSpaces(c,s.publicSpaces??[]);drawHousingPlotSurface(c,scene);
 for(const depth of ['far','middle','near'] as const)drawResidentialRoofs(c,scene,depth);
 for(const o of [...s.objects.filter(o=>o.civic),...s.objects.filter(o=>!o.civic&&o.kind!=='bridge')]){
  const f=ground.facilities.find(p=>p.id===o.id)!.plot;
  withinFootprint(c,f,()=>{
   if(o.civic){drawCivicArchitecture(c,o);return;}
   if(o.kind==='field'){
    c.fillStyle=o.condition==='ruined'?'#8b9077':'#ad996e';c.fillRect(f.x,f.y,f.width,f.depth);
    c.fillStyle=o.condition==='intact'?'#607748':'#8a8764';for(let x=f.x+2;x<f.x+f.width-1;x+=5)c.fillRect(x,f.y+1,2,f.depth-2);return;
   }
   if(o.kind==='market'&&o.condition!=='ruined'){
    c.fillStyle='#ad7c5c';c.beginPath();c.moveTo(o.x-19,o.y-13);c.lineTo(o.x,o.y-21);c.lineTo(o.x+19,o.y-13);c.closePath();c.fill();
    c.fillStyle='#97765e';c.fillRect(o.x-16,o.y-13,33,4);c.fillStyle='#70594b';for(const dx of [-13,0,13])c.fillRect(o.x+dx,o.y-9,2,15);
   }else drawBuildingSprite(c,o,o.kind==='hall'||o.kind==='granary');
   if(o.condition==='damaged'){c.fillStyle='#454e48';c.fillRect(o.x-6,o.y-2,6,2);}
  });
 }
 for(const g of ground.bridges){
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
 c.restore();
}
