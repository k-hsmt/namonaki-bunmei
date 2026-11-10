/** Terrain cut edges derive from the saved height delta. Coordinates are canonical. */
import {readOwnedRecordPhysics} from './owned-record-physics.js';
import {assertResolvedTerrain,type ResolvedTerrainAtYear} from './terrain-revision-v1.js';
import type {RecordSite} from './terrain-record-types.js';
import {drawTerrainRecord} from './draw-terrain-record-v1.js';
export function paintTerrainCutSurface(c:CanvasRenderingContext2D,view:ResolvedTerrainAtYear,site:RecordSite):void {
 assertResolvedTerrain(view);if(site!=='hill-side'||!view.changes.length)return;const r=readOwnedRecordPhysics(view.sites[site].physics);
 for(const event of view.changes){
  for(const cell of event.cells){if(cell[4]===cell[8])continue;const i=cell[0],x=i%320,y=Math.floor(i/320);
   if(view.year-event.effectiveYear<15){c.fillStyle='#a79b7b';c.fillRect(x,y,1,1);}
   // One pixel of exposed cut face where the neighboring saved ground is higher.
   if([x>0?i-1:-1,x<319?i+1:-1,y>96?i-320:-1,y<179?i+320:-1].some(j=>j>=0&&r.surface[j]===1&&r.elevation[j]!>r.elevation[i]!)){c.fillStyle='#877c65';c.fillRect(x,y,1,1);}
  }
 }
}
export function drawTerrainRevision(canvas:HTMLCanvasElement,view:ResolvedTerrainAtYear,site:RecordSite):void {
 drawTerrainRecord(canvas,view,site);const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');c.save();if(view.sites[site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}paintTerrainCutSurface(c,view,site);c.restore();
}
