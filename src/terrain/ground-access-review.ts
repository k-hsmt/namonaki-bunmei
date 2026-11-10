/** D3-A independent review kernel. No live engine, storage, or policy activation. */
import type {RecordPoint, RecordSite} from './terrain-record-types.js';
import {assertTerrainPhysicalYear,type TerrainPhysicalSource} from './terrain-revision-v1.js';
import type {RecordRaster} from './terrain-record-raster-v1.js';
import {readOwnedRecordPhysics,frozenRecordPhysics} from './owned-record-physics.js';
import type {WalkableBridgeCrossing} from './bridge-access-types.js';

export interface GroundPlot {readonly x:number;readonly y:number;readonly width:number;readonly depth:number}
export type GroundPurpose='house'|'field'|'hall'|'workshop'|'market'|'granary'|'housing'|'civic'|'public-space';
export interface GroundOccupation {readonly id:string;readonly plot:GroundPlot;readonly entrance:RecordPoint}
export interface GroundReviewContext {
 readonly terrain:TerrainPhysicalSource;readonly site:RecordSite;
 readonly year:number;readonly confirmedYear:number;readonly historyStatus:'known'|'partial'|'unknown';
 readonly primaryRoot:RecordPoint;readonly occupancy:readonly GroundOccupation[];
 /** Reservations are separate from real occupancy; the requesting ID excludes its own. */
 readonly reservations:readonly {readonly id:string;readonly plot:GroundPlot}[];
 readonly crossings?:readonly WalkableBridgeCrossing[];
}
export type GroundHold='unknown-history'|'unconfirmed-year'|'outside-ground'|'water'|'unstable'|'steep'|'occupied'|'no-access';
export type GroundReview={readonly status:'hold';readonly reason:GroundHold;readonly conflicts:readonly string[]}
 |{readonly status:'clear';readonly entrance:RecordPoint;readonly access:readonly RecordPoint[];readonly slopeCells:number};
const W=320,H=180,N=W*H;
const graphMetrics={walkGraphs:0,parentTraversals:0,distanceFields:0,targetedQueries:0,visitedVertices:0};
export function generatedGroundGraphMetrics(){return {...graphMetrics};}
/** Revised Q6 trial values; not an approved or persisted production policy. */
export const groundReviewLimits=Object.freeze({normalGrade:1,normalRelief:1,flatGrade:0,flatRelief:0,passageWidth:2,candidateStep:2});
const validPlot=(p:GroundPlot)=>[p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)&&p.width>=2&&p.depth>=1&&p.x>=0&&p.y>=96&&p.x+p.width<=W&&p.y+p.depth<=H;
const validPoint=(p:RecordPoint)=>Number.isSafeInteger(p[0])&&Number.isSafeInteger(p[1])&&p[0]>=0&&p[0]<W-1&&p[1]>=96&&p[1]<H-1;
const overlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
const hold=(reason:GroundHold,conflicts:readonly string[]=[]):GroundReview=>({status:'hold',reason,conflicts});
export function southEntrance(p:GroundPlot):RecordPoint{return [p.x+Math.floor((p.width-2)/2),p.y+p.depth];}

/** Physical stage only. A clear result here is never a construction permit. */
export function reviewPhysicalPlot(r:RecordRaster,purpose:GroundPurpose,plot:GroundPlot,limits:typeof groundReviewLimits=groundReviewLimits):
 {status:'clear';slopeCells:number}|{status:'hold';reason:GroundHold} {
 if(!validPlot(plot))return {status:'hold',reason:'outside-ground'};
 const flat=['hall','market','civic','public-space'].includes(purpose);
 let low=255,high=0,slopeCells=0,outside=false,water=false,unstable=false,steep=false;
 for(let y=plot.y;y<plot.y+plot.depth;y++)for(let x=plot.x;x<plot.x+plot.width;x++){
  const i=y*W+x,s=r.surface[i],g=r.grade[i]!;
  outside ||=s===0;water ||=s===2||s===3;unstable ||=r.bearing[i]!==0;
  low=Math.min(low,r.elevation[i]!);high=Math.max(high,r.elevation[i]!);slopeCells+=+(g===1);
  steep ||=g>(flat?limits.flatGrade:limits.normalGrade);
 }
 // Preserve the original reason precedence even when several cells fail.
 if(outside)return {status:'hold',reason:'outside-ground'};
 if(water)return {status:'hold',reason:'water'};
 if(unstable)return {status:'hold',reason:'unstable'};
 if(steep||high-low>(flat?limits.flatRelief:limits.normalRelief))return {status:'hold',reason:'steep'};
 return {status:'clear',slopeCells};
}

/** Canonical coordinates, as stored in physics; mirroring belongs to projection only. */
export function groundWalkWindows(r:RecordRaster,plots:readonly GroundPlot[],crossings:readonly WalkableBridgeCrossing[]=[],blockingAfterCrossings:readonly GroundPlot[]=plots):Uint8Array {
 graphMetrics.walkGraphs++;
 const cells=new Uint8Array(N),windows=new Uint8Array(N);
 for(let i=96*W;i<N;i++)cells[i]=+(r.surface[i]===1&&r.bearing[i]===0&&r.grade[i]!<=1);
 for(const p of plots)for(let y=p.y;y<p.y+p.depth;y++)cells.fill(0,y*W+p.x,y*W+p.x+p.width);
 if(crossings.length){
  for(const crossing of crossings){const p=crossing.deck;if(!validPlot(p)||p.depth!==4)throw Error('Invalid verified bridge deck');
   for(let y=p.y;y<p.y+p.depth;y++)cells.fill(1,y*W+p.x,y*W+p.x+p.width);
  }
  // Ordinary buildings and new candidates stay blocked even above a bridge.
  for(const p of blockingAfterCrossings)for(let y=p.y;y<p.y+p.depth;y++)cells.fill(0,y*W+p.x,y*W+p.x+p.width);
 }
 for(let y=96;y<H-1;y++)for(let x=0;x<W-1;x++){
  const i=y*W+x;windows[i]=+(cells[i]===1&&cells[i+1]===1&&cells[i+W]===1&&cells[i+W+1]===1);
 }return windows;
}
export function groundContextWindows(r:RecordRaster,ctx:GroundReviewContext,extra:readonly GroundPlot[]=[]):Uint8Array {
 const crossings=ctx.crossings??[];if(crossings.some(c=>c.site!==ctx.site))throw Error('Bridge crossing site mismatch');
 if(!crossings.length)return groundWalkWindows(r,[...ctx.occupancy.map(o=>o.plot),...extra]);
 const owned=new Set(crossings.flatMap(c=>[...c.occupiedIds]));
 return groundWalkWindows(r,[...ctx.occupancy.map(o=>o.plot),...extra],crossings,[...ctx.occupancy.filter(o=>!owned.has(o.id)).map(o=>o.plot),...extra]);
}
export function groundReachParents(windows:Uint8Array,root:RecordPoint):Int32Array {
 graphMetrics.parentTraversals++;
 const parent=new Int32Array(N);parent.fill(-1);
 if(!validPoint(root))return parent;
 const start=root[1]*W+root[0];if(!windows[start])return parent;
 const queue=new Int32Array(N);let head=0,tail=1;queue[0]=start;parent[start]=start;
 while(head<tail){const i=queue[head++]!,x=i%W,y=Math.floor(i/W);
  // Fixed N,E,S,W order and first-visit parents.
  let next=i-W;if(y>96&&windows[next]&&parent[next]===-1){parent[next]=i;queue[tail++]=next;}
  next=i+1;if(x<W-2&&windows[next]&&parent[next]===-1){parent[next]=i;queue[tail++]=next;}
  next=i+W;if(y<H-2&&windows[next]&&parent[next]===-1){parent[next]=i;queue[tail++]=next;}
  next=i-1;if(x>0&&windows[next]&&parent[next]===-1){parent[next]=i;queue[tail++]=next;}
 }graphMetrics.visitedVertices+=tail;return parent;
}
export function groundDistances(windows:Uint8Array,root:RecordPoint):Int32Array {
 return groundDistancesFromAny(windows,[root]);
}
/** Nearest confirmed neighbor distance in one traversal, with sorted N/E/S/W starts. */
export function groundDistancesFromAny(windows:Uint8Array,roots:readonly RecordPoint[]):Int32Array {
 graphMetrics.distanceFields++;
 const d=new Int32Array(N);d.fill(-1);const queue=new Int32Array(N);let head=0,tail=0;
 const starts=roots.filter(validPoint).map(p=>p[1]*W+p[0]).sort((a,b)=>a-b);
 for(const i of starts)if(windows[i]&&d[i]===-1){d[i]=0;queue[tail++]=i;}
 while(head<tail){const i=queue[head++]!,x=i%W,y=Math.floor(i/W);
  let j=i-W;if(y>96&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
  j=i+1;if(x<W-2&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
  j=i+W;if(y<H-2&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
  j=i-1;if(x>0&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
 }graphMetrics.visitedVertices+=tail;return d;
}
/** Exact distances from one window to the nearest member of each group.
 * Walking is undirected, so these equal the reverse multi-source fields at that
 * window. Stop only after every reachable required group has been found, or
 * after exhausting the component. Empty/unreachable groups return -1.
 */
export function groundDistancesToGroups(windows:Uint8Array,from:RecordPoint,groups:readonly (readonly RecordPoint[])[]):readonly number[] {
 graphMetrics.targetedQueries++;const result=groups.map(()=>-1);
 if(!validPoint(from)||!windows[from[1]*W+from[0]])return result;
 const members=new Map<number,number[]>(),active=new Set<number>();
 groups.forEach((group,g)=>{for(const p of group){if(!validPoint(p))continue;const i=p[1]*W+p[0];if(!windows[i])continue;
  const ids=members.get(i)??[];ids.push(g);members.set(i,ids);active.add(g);
 }});
 let remaining=active.size;if(!remaining)return result;
 graphMetrics.distanceFields++;
 const d=new Int32Array(N);d.fill(-1);const queue=new Int32Array(N),start=from[1]*W+from[0];
 let head=0,tail=1;queue[0]=start;d[start]=0;
 while(head<tail){const i=queue[head++]!,x=i%W,y=Math.floor(i/W);
  const ids=members.get(i);if(ids)for(const g of ids)if(result[g]===-1){result[g]=d[i]!;remaining--;}
  if(!remaining)break;
  let j=i-W;if(y>96&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
  j=i+1;if(x<W-2&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
  j=i+W;if(y<H-2&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
  j=i-1;if(x>0&&windows[j]&&d[j]===-1){d[j]=d[i]!+1;queue[tail++]=j;}
 }
 graphMetrics.visitedVertices+=tail;return result;
}
function index(p:RecordPoint):number{return p[1]*W+p[0];}

/** All-cell physical checks followed by hypothetical occupancy and connection-loss checks.
 * Provisional D0 limits only: intentionally cannot mint a production placementPolicy.
 * Bridges are not accepted until D3-C validates saved supports/deck/state.
 */
export function reviewGroundAccess(ctx:GroundReviewContext,purpose:GroundPurpose,objectId:string,plot:GroundPlot):GroundReview {
 return reviewGroundAccessPrepared(ctx,purpose,objectId,plot);
}
/** One synchronous search owns a fixed occupancy snapshot. Only the unchanged
 * before-graph is reused; each candidate still gets its own after-graph.
 */
export function createGroundAccessReviewer(ctx:GroundReviewContext):(purpose:GroundPurpose,objectId:string,plot:GroundPlot)=>GroundReview {
 return createGroundAccessTransaction(ctx).review;
}
/** The score query may read the exact after-graph already checked for access.
 * No graph is reused across different candidates or mutable contexts.
 */
export function createGroundAccessTransaction(ctx:GroundReviewContext):{readonly review:(purpose:GroundPurpose,objectId:string,plot:GroundPlot)=>GroundReview;readonly windows:Uint8Array|null} {
 assertTerrainPhysicalYear(ctx.terrain,ctx.year);
 const site=ctx.terrain.sites[ctx.site];
 const immutable=Object.isFrozen(ctx.terrain)&&Object.isFrozen(ctx.terrain.sites)&&Object.isFrozen(site)&&frozenRecordPhysics(site.physics);
 const owned:GroundReviewContext=immutable?{...structuredClone({...ctx,terrain:null}),terrain:ctx.terrain}:ctx;
 let parents:Int32Array|undefined,lastWindows:Uint8Array|null=null;
 const before=()=>parents??=(groundReachParents(groundContextWindows(readOwnedRecordPhysics(site.physics),owned),owned.primaryRoot));
 const after=(r:RecordRaster,plot:GroundPlot)=>lastWindows=groundContextWindows(r,owned,[plot]);
 return {review:(purpose,id,plot)=>{lastWindows=null;return reviewGroundAccessPrepared(owned,purpose,id,plot,immutable?before:undefined,after);},get windows(){return lastWindows;}};
}
function reviewGroundAccessPrepared(ctx:GroundReviewContext,purpose:GroundPurpose,objectId:string,plot:GroundPlot,beforeGraph?:()=>Int32Array,afterWindows?:(r:RecordRaster,plot:GroundPlot)=>Uint8Array):GroundReview {
 assertTerrainPhysicalYear(ctx.terrain,ctx.year);
 if(ctx.historyStatus!=='known')return hold('unknown-history');
 if(!Number.isSafeInteger(ctx.year)||!Number.isSafeInteger(ctx.confirmedYear)||ctx.year<0||ctx.year>ctx.confirmedYear)return hold('unconfirmed-year');
 if(!validPlot(plot))return hold('outside-ground');
 if(ctx.occupancy.some(o=>!validPlot(o.plot)||!validPoint(o.entrance))||ctx.reservations.some(o=>!validPlot(o.plot)))throw Error('Invalid ground context');
 const r=readOwnedRecordPhysics(ctx.terrain.sites[ctx.site].physics),physical=reviewPhysicalPlot(r,purpose,plot);
 if(physical.status==='hold')return hold(physical.reason);
 if(purpose!=='field'){
  const water=(x:number,y:number)=>x>=0&&x<W&&y>=96&&y<H&&(r.surface[y*W+x]===2||r.surface[y*W+x]===3);
  for(let x=plot.x;x<plot.x+plot.width;x++)if(water(x,plot.y-1)||water(x,plot.y+plot.depth))return hold('water');
  for(let y=plot.y;y<plot.y+plot.depth;y++)if(water(plot.x-1,y)||water(plot.x+plot.width,y))return hold('water');
 }
 const conflicts=[...ctx.occupancy,...ctx.reservations.filter(o=>o.id!==objectId)].filter(o=>overlap(plot,o.plot)).map(o=>o.id);
 if(conflicts.length)return hold('occupied',[...new Set(conflicts)].sort());
 const entrance=southEntrance(plot);
 const before=beforeGraph?beforeGraph():groundReachParents(groundContextWindows(r,ctx),ctx.primaryRoot),after=groundReachParents(afterWindows?afterWindows(r,plot):groundContextWindows(r,ctx,[plot]),ctx.primaryRoot);
 if(!validPoint(entrance)||after[index(entrance)]===-1)return hold('no-access');
 for(const o of ctx.occupancy)if(before[index(o.entrance)]!==-1&&after[index(o.entrance)]===-1)return hold('no-access',[o.id]);
 const access:RecordPoint[]=[];let i=index(entrance);
 while(true){access.push([i%W,Math.floor(i/W)]);if(after[i]===i)break;i=after[i]!;}
 access.reverse();return {status:'clear',entrance,access,slopeCells:physical.slopeCells};
}
