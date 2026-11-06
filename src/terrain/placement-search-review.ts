/** D3-A exact branch-and-bound search for trial ordinary building scores.
 * Does not mint a policy, append history, or substitute for social conditions.
 */
import type {RecordPoint} from './terrain-record-types.js';
import {decodeRecordPhysics} from './terrain-record-raster-v1.js';
import {terrainHash} from './hill-prototype.js';
import {groundWalkWindows,groundDistances,reviewPhysicalPlot,reviewGroundAccess,southEntrance,type GroundPlot,type GroundPurpose,type GroundReviewContext} from './ground-access-review.js';
export interface SearchReviewRequest {
 readonly objectId:string;readonly purpose:GroundPurpose;readonly width:number;readonly depth:number;
 readonly nucleus:RecordPoint;readonly neighborEntrances:readonly RecordPoint[];
}
const N=57600,W=320;
const index=(p:RecordPoint)=>p[1]*W+p[0];
const overlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
/** Full enumeration mode is retained as an independent check on pruning decisions. */
export function findPlacementReview(ctx:GroundReviewContext,req:SearchReviewRequest,mode:'bounded'|'exhaustive'='bounded'){
 const metrics={enumerated:0,physicalClear:0,accessEvaluations:0,scoreEvaluations:0};
 const stop=(reason:string)=>({status:'hold' as const,reason,metrics});
 if(ctx.historyStatus!=='known')return stop('unknown-history');
 if(!Number.isSafeInteger(ctx.year)||ctx.year<0||!Number.isSafeInteger(ctx.confirmedYear)||ctx.year>ctx.confirmedYear)return stop('unconfirmed-year');
 if(!Number.isSafeInteger(req.width)||!Number.isSafeInteger(req.depth)||req.width<2||req.width>320||req.depth<1||req.depth>84)return stop('outside-ground');
 // Field/civic/public-space have additional semantic ranking/anchor rules not implemented here.
 if(!['house','housing','hall','market','workshop','granary'].includes(req.purpose))return stop('unsupported-review-purpose');
 const r=decodeRecordPhysics(ctx.terrain.sites[ctx.site].physics),occupied=ctx.occupancy.map(o=>o.plot),baseWindows=groundWalkWindows(r,occupied);
 const sources=[req.nucleus,...req.neighborEntrances],base=sources.map(p=>groundDistances(baseWindows,p));
 const water=new Int32Array(N);water.fill(N);const queue:number[]=[];
 for(let i=96*W;i<N;i++)if(r.surface[i]===2||r.surface[i]===3){water[i]=0;queue.push(i);}
 for(let head=0;head<queue.length;head++){
  const i=queue[head]!,x=i%W,y=Math.floor(i/W);
  for(const j of [y>96?i-W:-1,x<319?i+1:-1,y<179?i+W:-1,x>0?i-1:-1])if(j>=0&&water[j]!>water[i]!+1){water[j]=water[i]!+1;queue.push(j);}
 }
 const rank=(distances:readonly Int32Array[],entry:RecordPoint,penalty:number):number=>{
  const i=index(entry),core=distances[0]![i];if(core===undefined||core<0)return Infinity;
  let near=Infinity;for(const d of distances.slice(1))if(d[i]!==undefined&&d[i]!>=0)near=Math.min(near,d[i]!);
  if(req.neighborEntrances.length&&!Number.isFinite(near))return Infinity;
  return 4*core+(req.purpose==='housing'?6:3)*(Number.isFinite(near)?near:0)+penalty;
 };
 const candidates:{plot:GroundPlot;entrance:RecordPoint;penalty:number;lower:number}[]=[];
 for(let y=96;y+req.depth<=180;y+=2)for(let x=2;x+req.width<=320;x+=2){
  metrics.enumerated++;const plot={x,y,width:req.width,depth:req.depth};
  const physical=reviewPhysicalPlot(r,req.purpose,plot);if(physical.status!=='clear')continue;
  metrics.physicalClear++;
  if([...ctx.occupancy,...ctx.reservations.filter(o=>o.id!==req.objectId)].some(o=>overlap(o.plot,plot)))continue;
  let dwater=N;for(let py=y;py<y+req.depth;py++)for(let px=x;px<x+req.width;px++)dwater=Math.min(dwater,water[py*W+px]!);
  if(dwater<2)continue;
  const entrance=southEntrance(plot),penalty=(dwater<8?(8-dwater)*4:0)+physical.slopeCells+Math.max(0,y-150)*2+
   terrainHash(['placement-search-review-v1',ctx.terrain.source.seed,req.purpose,ctx.site,req.objectId,x,y])%4;
  const lower=rank(base,entrance,penalty);if(Number.isFinite(lower))candidates.push({plot,entrance,penalty,lower});
 }
 candidates.sort((a,b)=>a.lower-b.lower||a.plot.y-b.plot.y||a.plot.x-b.plot.x);
 let best:{plot:GroundPlot;entrance:RecordPoint;access:readonly RecordPoint[];score:number}|null=null;
 for(const c of candidates){
  if(mode==='bounded'&&best&&c.lower>best.score)break;
  metrics.accessEvaluations++;
  const review=reviewGroundAccess(ctx,req.purpose,req.objectId,c.plot);if(review.status!=='clear')continue;
  metrics.scoreEvaluations++;
  const windows=groundWalkWindows(r,[...occupied,c.plot]),distances=sources.map(p=>groundDistances(windows,p)),score=rank(distances,c.entrance,c.penalty);
  if(!Number.isFinite(score))continue;
  if(!best||score<best.score||score===best.score&&(c.plot.y<best.plot.y||c.plot.y===best.plot.y&&c.plot.x<best.plot.x))best={plot:c.plot,entrance:c.entrance,access:review.access,score};
 }
 return best?{status:'review-only' as const,...best,metrics}:stop('no-safe-plot');
}
