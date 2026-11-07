/** D3-A exact branch-and-bound search for trial ordinary building scores.
 * Does not mint a policy, append history, or substitute for social conditions.
 */
import type {RecordPoint} from './terrain-record-types.js';
import {decodeRecordPhysics} from './terrain-record-raster-v1.js';
import {readOwnedRecordPhysics,frozenRecordPhysics} from './owned-record-physics.js';
import {terrainHash,terrainCoordinateHasher} from './terrain-hash-v1.js';
import {organicAttraction,organicDensityPenalty,organicPlotClear,organicGrowthLimits,type GrowthPattern} from './organic-placement-v2.js';
import {groundContextWindows,groundDistances,groundDistancesFromAny,groundDistancesToGroups,reviewPhysicalPlot,reviewGroundAccess,createGroundAccessTransaction,southEntrance,type GroundPlot,type GroundPurpose,type GroundReviewContext} from './ground-access-review.js';
export interface SearchReviewRequest {
 readonly objectId:string;readonly purpose:GroundPurpose;readonly width:number;readonly depth:number;
 readonly nucleus:RecordPoint;readonly neighborEntrances:readonly RecordPoint[];
 /** Civic distance to the nearest confirmed housing entrance, independent of hall distance. */
 readonly housingEntrances?:readonly RecordPoint[];
 readonly growthPattern?:GrowthPattern;
}
const N=57600,W=320;
const index=(p:RecordPoint)=>p[1]*W+p[0];
const overlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
interface StaticPlots {enumerated:number;physicalClear:number;plots:readonly {plot:GroundPlot;slopeCells:number;waterPenalty:number}[]}
const staticPlots=new WeakMap<object,Map<string,StaticPlots>>();
const searchMetrics={requests:0,physicalBuilds:0,physicalCacheHits:0,enumerated:0,physicalClear:0,availabilityRejects:0,accessEvaluations:0,scoreEvaluations:0};
export function generatedPlacementSearchMetrics(){return {...searchMetrics};}
/** Physics is immutable across births, HOLDs and bridge condition changes.
 * Occupancy, reservations, access, distances and scores remain dynamic.
 */
function physicalCandidates(ctx:GroundReviewContext,req:SearchReviewRequest,r:ReturnType<typeof decodeRecordPhysics>,cache:boolean):StaticPlots {
 const physics=ctx.terrain.sites[ctx.site].physics,key=JSON.stringify([req.purpose,req.width,req.depth]);
 const frozen=cache&&frozenRecordPhysics(physics);
 const found=frozen?staticPlots.get(physics)?.get(key):undefined;if(found){searchMetrics.physicalCacheHits++;return found;}
 searchMetrics.physicalBuilds++;
 const water=new Int32Array(N);water.fill(N);const queue:number[]=[];
 // Sea proximity must not be interpreted as freshwater irrigation for fields.
 for(let i=96*W;i<N;i++)if(r.surface[i]===2||req.purpose!=='field'&&r.surface[i]===3){water[i]=0;queue.push(i);}
 for(let head=0;head<queue.length;head++){
  const i=queue[head]!,x=i%W,y=Math.floor(i/W);
  for(const j of [y>96?i-W:-1,x<319?i+1:-1,y<179?i+W:-1,x>0?i-1:-1])if(j>=0&&water[j]!>water[i]!+1){water[j]=water[i]!+1;queue.push(j);}
 }
 const result:{enumerated:number;physicalClear:number;plots:{plot:GroundPlot;slopeCells:number;waterPenalty:number}[]}={enumerated:0,physicalClear:0,plots:[]};
 for(let y=96;y+req.depth<=180;y+=2)for(let x=2;x+req.width<=320;x+=2){
  result.enumerated++;const plot={x,y,width:req.width,depth:req.depth},physical=reviewPhysicalPlot(r,req.purpose,plot);
  if(physical.status!=='clear')continue;result.physicalClear++;
  let dwater=N;for(let py=y;py<y+req.depth;py++)for(let px=x;px<x+req.width;px++)dwater=Math.min(dwater,water[py*W+px]!);
  if(req.purpose!=='field'&&dwater<2)continue;
  const waterPenalty=req.purpose==='field'?(queue.length?2*(Math.max(0,8-dwater)+Math.max(0,dwater-40)):0):(dwater<8?(8-dwater)*4:0);
  result.plots.push({plot,slopeCells:physical.slopeCells,waterPenalty});
 }
 if(frozen){let entries=staticPlots.get(physics);if(!entries){entries=new Map();staticPlots.set(physics,entries);}entries.set(key,result);}
 searchMetrics.enumerated+=result.enumerated;searchMetrics.physicalClear+=result.physicalClear;
 return result;
}
/** Full enumeration mode is retained as an independent check on pruning decisions. */
export function findPlacementReview(ctx:GroundReviewContext,req:SearchReviewRequest,mode:'bounded'|'exhaustive'='bounded'){
 searchMetrics.requests++;
 const metrics={enumerated:0,physicalClear:0,accessEvaluations:0,scoreEvaluations:0,distanceFieldBuilds:0,targetedDistanceQueries:0};
 const stop=(reason:string)=>({status:'hold' as const,reason,metrics});
 if(ctx.historyStatus!=='known')return stop('unknown-history');
 if(!Number.isSafeInteger(ctx.year)||ctx.year<0||!Number.isSafeInteger(ctx.confirmedYear)||ctx.year>ctx.confirmedYear)return stop('unconfirmed-year');
 if(!Number.isSafeInteger(req.width)||!Number.isSafeInteger(req.depth)||req.width<2||req.width>320||req.depth<1||req.depth>84)return stop('outside-ground');
 // Public space still needs its constrained anchor neighborhood.
 if(!['house','field','housing','hall','market','workshop','granary','civic'].includes(req.purpose))return stop('unsupported-review-purpose');
 if(req.purpose==='civic'&&!req.neighborEntrances.length)return stop('missing-anchor');
 if(req.growthPattern!==undefined&&req.growthPattern!=='organic-v2')throw Error('Unknown growth pattern');
 const organic=req.growthPattern==='organic-v2'?organicAttraction(ctx,req.purpose,req.objectId,req.nucleus,req.neighborEntrances):null;
 const neighbors=organic?[organic.anchor]:req.neighborEntrances;
 const r=readOwnedRecordPhysics(ctx.terrain.sites[ctx.site].physics);
 const physical=physicalCandidates(ctx,req,r,mode==='bounded');metrics.enumerated=physical.enumerated;metrics.physicalClear=physical.physicalClear;
 const occupied=[...ctx.occupancy,...ctx.reservations.filter(o=>o.id!==req.objectId)];
 const actualPlots=organic?ctx.occupancy.map(o=>o.plot):[];
 const available=physical.plots.filter(c=>!occupied.some(o=>overlap(o.plot,c.plot))&&(!organic||organicPlotClear(c.plot,actualPlots,req.purpose)));
 // No access graph can make a physically impossible or occupied plot valid.
 if(!available.length){searchMetrics.availabilityRejects++;return stop('no-safe-plot');}
 const baseWindows=groundContextWindows(r,ctx);
 const housing=req.purpose==='civic'?req.housingEntrances??[]:[];
 const distancesFor=(windows:Uint8Array)=>{
  metrics.distanceFieldBuilds+=2+(housing.length?1:0);
  return [groundDistances(windows,req.nucleus),groundDistancesFromAny(windows,neighbors),
   ...(housing.length?[groundDistancesFromAny(windows,housing)]:[])];
 };
 const base=distancesFor(baseWindows);
 const rankValues=(core:number|undefined,closest:number|undefined,homes:number|undefined,penalty:number,lower=false):number=>{
  if(core===undefined||core<0)return Infinity;
  const near=closest!==undefined&&closest>=0?closest:Infinity;
  if(neighbors.length&&!Number.isFinite(near))return Infinity;
  if(homes===undefined||homes<0)return Infinity;
  if(organic){
   if(near>organicGrowthLimits.maxWalk)return Infinity;
   // Candidate occupation can increase distance. Below the preferred band the
   // admissible lower bound is zero, rather than the nonmonotone close penalty.
   const local=3*(Math.max(0,near-organic.maximum)+(lower?0:Math.max(0,organic.minimum-near)));
   return Math.min(core,organicGrowthLimits.coreCap)+local+homes+penalty;
  }
  // For fields the 2/px preference outside 12..64 is monotone together with
  // the 3*Dneighbor term: total derivative is 1,3,5. Lower-bound pruning is safe.
  const fieldNeighborPenalty=req.purpose==='field'&&Number.isFinite(near)?2*(Math.max(0,12-near)+Math.max(0,near-64)):0;
  return 4*core+(req.purpose==='housing'?6:3)*(Number.isFinite(near)?near:0)+3*homes+fieldNeighborPenalty+penalty;
 };
 const rank=(distances:readonly Int32Array[],entry:RecordPoint,penalty:number,lower=false)=>{
  const i=index(entry);return rankValues(distances[0]![i],distances[1]![i],housing.length?distances[2]![i]:0,penalty,lower);
 };
 const candidates:{plot:GroundPlot;entrance:RecordPoint;penalty:number;lower:number}[]=[];
 const hashPrefix=['placement-search-review-v2',ctx.terrain.source.seed,req.purpose,ctx.site,req.objectId];
 const coordinateHash=mode==='bounded'?terrainCoordinateHasher(hashPrefix):(x:number,y:number)=>terrainHash([...hashPrefix,x,y]);
 for(const {plot,slopeCells,waterPenalty} of available){
  const {x,y}=plot;
  const entrance=southEntrance(plot),penalty=waterPenalty+slopeCells+Math.max(0,y-150)*2+
   coordinateHash(x,y)%4+(organic?organicDensityPenalty(plot,actualPlots):0);
  const lower=rank(base,entrance,penalty,true);if(Number.isFinite(lower))candidates.push({plot,entrance,penalty,lower});
 }
 candidates.sort((a,b)=>a.lower-b.lower||a.plot.y-b.plot.y||a.plot.x-b.plot.x);
 const transaction=mode==='bounded'?createGroundAccessTransaction(ctx):null;
 let best:{plot:GroundPlot;entrance:RecordPoint;access:readonly RecordPoint[];score:number}|null=null;
 for(const c of candidates){
  if(mode==='bounded'&&best&&c.lower>best.score)break;
  metrics.accessEvaluations++;
  searchMetrics.accessEvaluations++;
  const review=transaction?transaction.review(req.purpose,req.objectId,c.plot):reviewGroundAccess(ctx,req.purpose,req.objectId,c.plot);if(review.status!=='clear')continue;
  metrics.scoreEvaluations++;
  searchMetrics.scoreEvaluations++;
  const windows=transaction?.windows??groundContextWindows(r,ctx,[c.plot]);let score:number;
  if(mode==='exhaustive')score=rank(distancesFor(windows),c.entrance,c.penalty);
  else {
   metrics.targetedDistanceQueries++;const distances=groundDistancesToGroups(windows,c.entrance,[[req.nucleus],neighbors,housing]);
   score=rankValues(distances[0],distances[1],housing.length?distances[2]:0,c.penalty);
  }
  if(!Number.isFinite(score))continue;
  if(!best||score<best.score||score===best.score&&(c.plot.y<best.plot.y||c.plot.y===best.plot.y&&c.plot.x<best.plot.x))best={plot:{...c.plot},entrance:c.entrance,access:review.access,score};
 }
 return best?{status:'review-only' as const,...best,metrics}:stop('no-safe-plot');
}
