/** Producer is used only for a genuinely new world's initial vegetation. */
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {vegetationSites,vegetationPatchPlot,syncVegetationHistory,freezeVegetation,type VegetationHistory,type VegetationPatch} from './history-v1.js';
export function createInitialVegetation(r:GeneratedFacilityReview):VegetationHistory {
 const initial={} as Record<typeof vegetationSites[number],(VegetationPatch|null)[]>;
 for(const site of vegetationSites){
  const raster=readOwnedRecordPhysics(r.terrain.sites[site].physics),water=new Int32Array(57600);water.fill(57600);const queue:number[]=[];
  for(let i=96*320;i<57600;i++)if(raster.surface[i]===2){water[i]=0;queue.push(i);}
  for(let head=0;head<queue.length;head++){const i=queue[head]!,x=i%320,y=Math.floor(i/320);for(const j of [x>0?i-1:-1,x<319?i+1:-1,y>96?i-320:-1,y<179?i+320:-1])if(j>=0&&water[j]!>water[i]!+1){water[j]=water[i]!+1;queue.push(j);}}
  initial[site]=Array.from({length:440},(_,i)=>{
   const p=vegetationPatchPlot(i);let cells=0,slope=0,d=57600;for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+8;x++){const j=y*320+x;if(raster.surface[j]===1&&raster.bearing[j]===0){cells++;slope+=raster.grade[j]!;d=Math.min(d,water[j]!);}}
   if(!cells)return null;
   const h=terrainHash(['vegetation-initial-v1',r.state.seed,site,i]),cluster=terrainHash(['vegetation-stand-v1',r.state.seed,site,Math.floor(p.x/40),Math.floor((p.y-96)/24)]),open=slope/cells>.45&&(d>32);
   return [cluster%5===0?75+h%90:h%25,d<36?1:(h%2?1:2),open?2:4] as VegetationPatch;
  });
 }
 return syncVegetationHistory(freezeVegetation({schemaVersion:1,ruleId:'patch-succession-v1',introducedYear:0,confirmedThrough:0,seed:r.state.seed,initial,events:[]}),r);
}
