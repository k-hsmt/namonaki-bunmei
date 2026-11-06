import {drawHillPrototype} from './draw-hill-prototype.js';
import {drawRiverPrototype} from './draw-river-prototype.js';
import {drawCoastPrototype} from './draw-coast-prototype.js';
import {drawMountainProjection} from './mountain-prototype.js';
import {riverLandRaster,type WorldPrototype,type PrototypeSite} from './world-prototype.js';
/** Every layer receives the same view transform, including the shared peaks. */
export function drawWorldPrototype(canvas:HTMLCanvasElement,w:WorldPrototype,site:PrototypeSite,physics=false):void {
 const drawFar=(c:CanvasRenderingContext2D)=>{
  c.fillStyle='#bdc9bb';c.fillRect(0,0,320,96);
  c.fillStyle='#d8cfad';c.fillRect(0,53,320,43);
  drawMountainProjection(c,w.views[site].mountains);
 };
 if(site==='hill-side')drawHillPrototype(canvas,w.hill,physics?'physics':'landscape',drawFar);
 else if(site==='river-bank'){
  drawRiverPrototype(canvas,w.river,drawFar);
  if(physics){const r=riverLandRaster(w.river),c=canvas.getContext('2d')!;
   for(let y=96;y<180;y++)for(let x=0;x<320;x++){c.fillStyle=r.bearing[y*320+x]===2?'#6c999e':'#8eaa83';c.fillRect(x,y,1,1);}}
 }
 else drawCoastPrototype(canvas,w.coast,physics,drawFar);
 if(w.views[site].mirrorX){
  const copy=canvas.ownerDocument.createElement('canvas');copy.width=320;copy.height=180;copy.getContext('2d')!.drawImage(canvas,0,0);
  const c=canvas.getContext('2d')!;c.save();c.setTransform(-1,0,0,1,320,0);c.drawImage(copy,0,0);c.restore();
 }
}
