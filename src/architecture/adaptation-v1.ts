/**
 * Issue #35 D2-a: recorded land observations used as regional adaptation inputs
 * (architecture-adaptation-v1). Only values that exist in the terrain record and initial vegetation
 * are read; no deposits, trade or technology are inferred. All outputs are integers in per-mille.
 */
import type {RecordRaster} from '../terrain/terrain-record-raster-v1.js';
import {vegetationStage,type VegetationPatch} from '../vegetation/history-v1.js';

/** Per-mille (0..1000) site measures taken from year-0 records. */
export interface SiteAdaptationInputs {
 /** Mean grade of buildable land (grade 0..2 scaled). */
 readonly slope:number;
 /** Share of the ground band that is fresh water or sea. */
 readonly water:number;
 /** Share of land cells that are cliff. */
 readonly rock:number;
 /** Share of vegetated patches that are mature woodland (stage >= 3) at year 0. */
 readonly forest:number;
}
const permille=(n:number,d:number)=>d?Math.round(1000*n/d):0;
const GROUND_TOP=96;

export function measureSiteAdaptation(raster:RecordRaster,patches:readonly (VegetationPatch|null)[]):SiteAdaptationInputs {
 let ground=0,water=0,land=0,cliff=0,buildable=0,grade=0;
 for(let i=GROUND_TOP*320;i<320*180;i++){
  ground++;const surface=raster.surface[i]!;
  if(surface===2||surface===3){water++;continue;}
  if(surface!==1)continue;
  land++;
  if(raster.bearing[i]===2){cliff++;continue;}
  if(raster.bearing[i]===0){buildable++;grade+=raster.grade[i]!;}
 }
 let vegetated=0,mature=0;
 for(const p of patches){if(!p)continue;vegetated++;if(vegetationStage(p[0],p[2])>=3)mature++;}
 return {slope:permille(grade,buildable*2),water:permille(water,ground),rock:permille(cliff,land),forest:permille(mature,vegetated)};
}

/** Per-building plot observation at the construction year (D2 §5.2 input 2). */
export interface PlotAdaptationInputs {
 /** Mean grade of the plot footprint, per-mille of the maximum grade. */
 readonly grade:number;
 /** True when fresh water or sea lies within a few pixels of the footprint. */
 readonly nearWater:boolean;
}
export function measurePlotAdaptation(raster:RecordRaster,plot:{readonly x:number;readonly y:number;readonly width:number;readonly depth:number},reach=4):PlotAdaptationInputs {
 let cells=0,grade=0,nearWater=false;
 for(let y=Math.max(GROUND_TOP,plot.y-reach);y<Math.min(180,plot.y+plot.depth+reach);y++)
  for(let x=Math.max(0,plot.x-reach);x<Math.min(320,plot.x+plot.width+reach);x++){
   const i=y*320+x,inside=x>=plot.x&&x<plot.x+plot.width&&y>=plot.y&&y<plot.y+plot.depth;
   if(raster.surface[i]===2||raster.surface[i]===3)nearWater=true;
   if(inside&&raster.surface[i]===1){cells++;grade+=raster.grade[i]!;}
  }
 return {grade:permille(grade,cells*2),nearWater};
}
