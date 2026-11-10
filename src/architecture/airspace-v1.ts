/**
 * Issue #35 D2-b2: the air-space envelope of a birth style (architecture-envelope-v1), derived from the
 * D2-c drawing geometry the Human accepted (PR #115):
 *  - facilities: the D1 drawing at D1 size, anchored like the live sprite (plot centre, 3px above its foot)
 *  - civic halls: the D1 hall widened to the civic plot (courtyard-hall: courtyard composition, height 15),
 *    anchored like the live civic drawing (plot centre, 5px above its foot)
 *  - housing: the H1 miniature of every roof part, placed by the live projectHousingBlock grid
 * Only the part above the plot's top edge counts as air space; the ground rows are the land ledger's
 * business (and are clipped to the plot for facilities, as in the live scene).
 *
 * Conflicts (design §6.2): an earlier envelope in the same depth band (ground lines within 6px) that
 * overlaps; a bridge deck under the envelope; water directly beside the plot in its lowest two rows.
 * Front/back overlaps between different depth bands are allowed, as in the live scene.
 */
import {projectHousingBlock} from '../scene/composition.js';
import type {RecordRaster} from '../terrain/terrain-record-raster-v1.js';
import {drawArchitecture,type ArchitectureSize} from './draw-v1.js';
import {drawMiniature} from './miniature-v1.js';
import type {ArchitectureSpec,PartialSpec,Use} from './vocab-v1.js';

export const ENVELOPE_ID='architecture-envelope-v1';
export const DEPTH_BAND=6;
/** Absolute screen rectangle [x0,x1) × [y0,y1) plus the ground line used for depth bands. */
export interface AirspaceRect {readonly x0:number;readonly x1:number;readonly y0:number;readonly y1:number;readonly ground:number}
type Plot={readonly x:number;readonly y:number;readonly width:number;readonly depth:number};
type Spec=PartialSpec&{readonly use:Use};

const bounds=(draw:(g:{rect:(x:number,y:number,w:number,h:number)=>void})=>void)=>{
 let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 draw({rect(x,y,w,h){if(w<=0||h<=0)return;x0=Math.min(x0,x);x1=Math.max(x1,x+w);y0=Math.min(y0,y);y1=Math.max(y1,y+h);}});
 return {x0,x1,y0,y1};
};
const above=(b:{x0:number;x1:number;y0:number},plot:Plot,ground:number):AirspaceRect=>({x0:b.x0,x1:b.x1,y0:b.y0,y1:Math.max(b.y0,plot.y),ground});

export function facilityAirspace(spec:Spec,plot:Plot,civic?:'great-hall'|'courtyard-hall'):AirspaceRect {
 const ax=plot.x+Math.floor(plot.width/2),ay=plot.y+plot.depth-(civic?5:3);
 const [use,size]:[Use,ArchitectureSize|undefined]=civic==='courtyard-hall'?['courtyard',{width:plot.width,height:15}]:civic?['hall',{width:plot.width}]:[spec.use,undefined];
 return above(bounds(g=>drawArchitecture({rect:(x,y,w,h)=>g.rect(x,y,w,h)},{...spec,use},ax,ay,size)),plot,plot.y+plot.depth);
}
/** The block as it stands right after the construction (parts [0, to)). */
export function housingAirspace(spec:Spec,block:Parameters<typeof projectHousingBlock>[0]):AirspaceRect {
 const composed=projectHousingBlock(block,true);
 const b=bounds(g=>{for(const p of composed.roofParts)drawMiniature({rect:(x,y,w,h)=>g.rect(x,y,w,h)},spec,p.x,p.y,p.depth);});
 return above(b,block.footprint,block.footprint.y+block.footprint.depth);
}

export interface AirspaceContext {
 /** Envelopes already recorded in this site, in construction order. */
 readonly earlier:readonly AirspaceRect[];
 /** Bridge decks standing in this site in the construction year. */
 readonly decks:readonly Plot[];
 /** Terrain of the construction year (surface 2 = fresh water, 3 = sea). */
 readonly raster:RecordRaster;
 readonly plot:Plot;
}
const overlap=(a:{x0:number;x1:number;y0:number;y1:number},b:{x0:number;x1:number;y0:number;y1:number})=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
/** Why an envelope does not fit, or null when it fits. */
export function airspaceConflict(e:AirspaceRect,ctx:AirspaceContext):string|null {
 if(e.y1<=e.y0)return null;
 for(const o of ctx.earlier)if(Math.abs(o.ground-e.ground)<=DEPTH_BAND&&overlap(e,o))return 'neighbour';
 for(const d of ctx.decks)if(overlap(e,{x0:d.x,x1:d.x+d.width,y0:d.y,y1:d.y+d.depth}))return 'bridge';
 const {plot,raster}=ctx;
 for(let y=Math.max(96,plot.y+plot.depth-2);y<Math.min(180,plot.y+plot.depth);y++)
  for(let x=Math.max(0,e.x0);x<Math.min(320,e.x1);x++){
   if(x>=plot.x&&x<plot.x+plot.width)continue;
   const s=raster.surface[y*320+x];if(s===2||s===3)return 'water';
  }
 return null;
}
export type {ArchitectureSpec};
