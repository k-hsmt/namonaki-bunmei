/** Climate phenology and distant relief, drawn from recorded climate and saved polygons. */
import {landscapeBand,projectLandscapeVegetation,type LeafPalette} from './landscape-v2.js';
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import type {GeneratedSceneGround} from '../scene/generated-ground-review.js';
export type Foliage='full'|'lush'|'sparse'|'bare';
export function climateFoliage(moisture:number,temperature:number):Foliage {
 const t=landscapeBand(temperature),m=landscapeBand(moisture);
 return t<=-32?'bare':t<=-16||m<=-32?'sparse':m>=24&&t>=-8?'lush':'full';
}
export function projectClimateVegetation(o:GeneratedSceneObservation){
 const v=projectLandscapeVegetation(o),e=o.ground.environment!,t=landscapeBand(e.temperature);
 const local=(point:readonly[number,number])=>landscapeBand(e.moisture[Math.floor((point[1]-96)/8)*40+Math.floor(point[0]/8)]??0);
 const palette=(m:number,old:LeafPalette):LeafPalette=>t<=-16?['#9a8d6d','#c0b99b','#706a58']:m<=-32?['#a18a50','#c4aa6a','#756645']:t>=24?['#6d8145','#a0a25a','#4b653a']:old;
 return {
  grass:v.grass.map(mark=>{const m=local(mark.point),dormant=t<=-16||m<=-32;return {...mark,height:dormant?1:mark.height,color:t<=-16?'#c1bba1':t>=24&&m<16?'#b4ab70':mark.color};}),
  shrubs:v.shrubs.map(mark=>{const m=local(mark.point);return {...mark,palette:palette(m,mark.palette),foliage:climateFoliage(m,e.temperature)};}),
  trees:v.trees.map(mark=>{const m=local(mark.point);return {...mark,palette:palette(m,mark.palette),foliage:climateFoliage(m,e.temperature)};})
 };
}
export function paintClimateMountains(c:CanvasRenderingContext2D,g:GeneratedSceneGround):void {
 const e=g.environment;if(!e||g.environmentAppearance!=='landscape-v3')return;
 const t=landscapeBand(e.temperature),h=landscapeBand(e.humidity),render=g.terrain.sites[g.site].render;
 for(const [layer,paths]of [render.far,render.middle].entries())for(const polygon of paths){
  const peak=Math.min(...polygon.map(p=>p[1])),base=Math.min(95,Math.max(...polygon.map(p=>p[1])));
  c.save();c.beginPath();c.moveTo(polygon[0]![0],polygon[0]![1]);for(const p of polygon.slice(1))c.lineTo(p[0],p[1]);c.closePath();c.clip();
  // Warm/dry ridges lose green; wet ridges deepen. Keep the saved silhouette.
  c.globalAlpha=t<=-16?.55:h<=-24?.65:h>=24?.45:t>=24?.45:0;
  c.fillStyle=t<=-16?(layer?'#919e94':'#a8b8ae'):h<=-24?'#b2a17b':h>=24?(layer?'#708768':'#8a9f83'):'#b0ae84';c.fillRect(0,0,320,96);c.globalAlpha=1;
  if(t<=-8&&base>peak){const cover=Math.min(.85,(-t-4)/44),line=peak+(base-peak)*cover;
   c.fillStyle=layer?'#cdd6ce':'#e1e5d9';for(let x=0;x<320;x++){const edge=Math.floor(line+Math.sin(x*.24+layer)*1.1+Math.sin(x*.63)*.6);c.fillRect(x,0,1,Math.min(95,Math.max(0,edge)));}
  }c.restore();
 }
}
