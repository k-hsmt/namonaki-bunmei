import {rasterizeCoast,type CoastPrototype} from './coast-prototype.js';
import {terrainHash} from './hill-prototype.js';
export const coastPhysicsColors=['#d8cfad','#8eaa83','#6c999e','#739aa9','#c7b78a','#68606d'] as const;
export function drawCoastPrototype(canvas:HTMLCanvasElement,t:CoastPrototype,physics=false,drawFar?:(c:CanvasRenderingContext2D)=>void):void {
 canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');if(!c)throw Error('missing 2d context');c.imageSmoothingEnabled=false;
 c.fillStyle='#bdc9bb';c.fillRect(0,0,320,96);c.fillStyle='#d8cfad';c.fillRect(0,53,320,43);
 if(drawFar)drawFar(c);
 const r=rasterizeCoast(t);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x,s=r.surface[i]!,b=r.bearing[i]!;
  c.fillStyle=physics?coastPhysicsColors[b===1?4:b===2?5:s]!:b===2?'#858575':b===1?'#c7b78a':s===3?'#739aa9':s===2?'#6c999e':'#a2a17a';
  c.fillRect(x,y,1,1);
 }
 if(physics)return;
 // A narrow shoreline highlight is on water only and never changes the mask.
 for(let y=97;y<179;y++)for(let x=1;x<319;x++){
  const i=y*320+x;if(r.surface[i]!<2)continue;
  if([i-1,i+1,i-320,i+320].some(j=>r.surface[j]===1)){c.fillStyle=r.surface[i]===3?'#a6b7ad':'#91aeaa';c.fillRect(x,y,1,1);}
  else if(y%11===0&&(x+y)%27<7){c.fillStyle='#8aaab1';c.fillRect(x,y,1,1);}
 }
 for(let n=0;n<130;n++){
  const h=terrainHash([t.generatorId,t.seed,'decoration',t.variant,n]),x=h%318,y=98+(h>>>9)%80,i=y*320+x;
  if(r.surface[i]===1&&r.surface[i+1]===1&&r.bearing[i]===0&&r.bearing[i+1]===0){c.fillStyle=n%3?'#959d72':'#bdb58d';c.fillRect(x,y,2,1);}
 }
}
