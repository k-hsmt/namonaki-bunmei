import {rasterizeHill,terrainHash,type HillPrototype,type HillRaster,type Point} from './hill-prototype.js';
export const hillGroundPalette={flat:'#a2a17a',raised:'#b3ae85',slope:'#8e9970',steep:'#7c8967',rock:'#858575'} as const;
export function hillGroundColor(r:HillRaster,i:number):string {
 if(r.bearing[i]===2)return hillGroundPalette.rock;
 // Integer grade alternates at rounded elevation steps. Painting it literally
 // produces artificial stripes; landscape tone follows broad height bands.
 const h=r.elevation[i]!;
 if(h===0)return hillGroundPalette.flat;
 if(h<8)return '#9b9f75';
 if(h<16)return '#a9a67d';
 return hillGroundPalette.raised;
}
/** Geometry-only preview. Far mountains are deliberately a common reference. */
export function drawHillPrototype(canvas:HTMLCanvasElement,t:HillPrototype,mode:'landscape'|'physics'='landscape',drawFar?:(c:CanvasRenderingContext2D)=>void):void {
 canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');
 c.imageSmoothingEnabled=false;
 c.fillStyle='#bdc9bb';c.fillRect(0,0,320,96);c.fillStyle='#d8cfad';c.fillRect(0,53,320,43);
 const polygon=(p:readonly Point[],color:string)=>{c.fillStyle=color;c.beginPath();c.moveTo(p[0]![0],p[0]![1]);for(const q of p.slice(1))c.lineTo(q[0],q[1]);c.closePath();c.fill();};
 if(drawFar)drawFar(c);
 else polygon([[0,96],[0,84],[47,71],[87,83],[134,64],[179,83],[227,72],[274,84],[320,73],[320,96]],'#9da991');
 const contours:Record<HillPrototype['variant'],readonly Point[]>={
  H01:[[0,80],[37,78],[72,83],[102,93],[147,102],[320,108]],
  H02:[[0,104],[35,91],[65,79],[92,82],[127,102],[177,101],[211,82],[239,78],[268,88],[302,104],[320,105]],
  H03:[[0,79],[32,82],[68,94],[99,104],[219,104],[250,93],[285,81],[320,79]],
  H04:[[0,105],[43,99],[66,81],[106,79],[216,79],[249,84],[274,102],[320,105]],
  H05:[[0,99],[34,88],[59,91],[93,103],[122,90],[150,87],[184,101],[214,98],[252,86],[279,91],[320,103]],
  H06:[[0,106],[72,104],[112,98],[151,91],[193,81],[223,78],[255,87],[283,99],[320,105]],
  H07:[[0,87],[71,85],[128,88],[207,84],[273,86],[320,84]],
  H08:[[0,78],[37,82],[57,92],[79,85],[101,104],[210,104],[235,84],[256,91],[280,79],[320,78]],
 };
 const offset=(terrainHash([t.generatorId,t.seed,'decoration',t.variant])%5)-2;
 polygon([[0,112],...contours[t.variant].map(([x,y])=>[x,y+offset] as Point),[320,112]],'#87926d');
 const r=rasterizeHill(t);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x;
  c.fillStyle=mode==='physics'?(r.bearing[i]===2?'#68606d':r.grade[i]===2?'#ab7058':r.grade[i]===1?'#b3aa69':'#8eaa83'):hillGroundColor(r,i);
  c.fillRect(x,y,1,1);
 }
 if(mode==='physics')return;
 // Surface detail has no collision role. The color-ID physics preview stays untextured.
 for(let n=0;n<150;n++){
  const h=terrainHash([t.generatorId,t.seed,'decoration',t.variant,n]),x=h%318,y=98+(h>>>9)%80,i=y*320+x;
  if(r.bearing[i]===2){c.fillStyle='#72776b';c.fillRect(x,y,2,1);}
  else if(r.grade[i]!==2){c.fillStyle=n%3?'#959d72':'#bdb58d';c.fillRect(x,y,2,1);}
 }
}
