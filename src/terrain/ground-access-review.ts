/** D3-A independent review kernel. No live engine, storage, or policy activation. */
import type {RecordPoint, RecordSite} from './terrain-record-types.js';
import type {ValidatedTerrainRecord} from './terrain-record.js';
import {decodeRecordPhysics, type RecordRaster} from './terrain-record-raster-v1.js';

export interface GroundPlot {readonly x:number;readonly y:number;readonly width:number;readonly depth:number}
export type GroundPurpose='house'|'field'|'hall'|'workshop'|'market'|'granary'|'housing'|'civic'|'public-space';
export interface GroundOccupation {readonly id:string;readonly plot:GroundPlot;readonly entrance:RecordPoint}
export interface GroundReviewContext {
 readonly terrain:ValidatedTerrainRecord;readonly site:RecordSite;
 readonly year:number;readonly confirmedYear:number;readonly historyStatus:'known'|'partial'|'unknown';
 readonly primaryRoot:RecordPoint;readonly occupancy:readonly GroundOccupation[];
 /** Reservations are separate from real occupancy; the requesting ID excludes its own. */
 readonly reservations:readonly {readonly id:string;readonly plot:GroundPlot}[];
}
export type GroundHold='unknown-history'|'unconfirmed-year'|'outside-ground'|'water'|'unstable'|'steep'|'occupied'|'no-access';
export type GroundReview={readonly status:'hold';readonly reason:GroundHold;readonly conflicts:readonly string[]}
 |{readonly status:'clear';readonly entrance:RecordPoint;readonly access:readonly RecordPoint[];readonly slopeCells:number};
const W=320,H=180,N=W*H;
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
 const indices:number[]=[];
 for(let y=plot.y;y<plot.y+plot.depth;y++)for(let x=plot.x;x<plot.x+plot.width;x++)indices.push(y*W+x);
 if(indices.some(i=>r.surface[i]===0))return {status:'hold',reason:'outside-ground'};
 if(indices.some(i=>r.surface[i]===2||r.surface[i]===3))return {status:'hold',reason:'water'};
 if(indices.some(i=>r.bearing[i]!==0))return {status:'hold',reason:'unstable'};
 const flat=['hall','market','civic','public-space'].includes(purpose);
 let low=255,high=0,slopeCells=0;
 for(const i of indices){low=Math.min(low,r.elevation[i]!);high=Math.max(high,r.elevation[i]!);slopeCells+=+(r.grade[i]===1);}
 if(indices.some(i=>r.grade[i]!>(flat?limits.flatGrade:limits.normalGrade))||high-low>(flat?limits.flatRelief:limits.normalRelief))return {status:'hold',reason:'steep'};
 return {status:'clear',slopeCells};
}

/** Canonical coordinates, as stored in physics; mirroring belongs to projection only. */
export function groundWalkWindows(r:RecordRaster,plots:readonly GroundPlot[]):Uint8Array {
 const cells=new Uint8Array(N),windows=new Uint8Array(N);
 for(let i=96*W;i<N;i++)cells[i]=+(r.surface[i]===1&&r.bearing[i]===0&&r.grade[i]!<=1);
 for(const p of plots)for(let y=p.y;y<p.y+p.depth;y++)cells.fill(0,y*W+p.x,y*W+p.x+p.width);
 for(let y=96;y<H-1;y++)for(let x=0;x<W-1;x++){
  const i=y*W+x;windows[i]=+(cells[i]===1&&cells[i+1]===1&&cells[i+W]===1&&cells[i+W+1]===1);
 }return windows;
}
export function groundReachParents(windows:Uint8Array,root:RecordPoint):Int32Array {
 const parent=new Int32Array(N);parent.fill(-1);
 if(!validPoint(root))return parent;
 const start=root[1]*W+root[0];if(!windows[start])return parent;
 const queue=new Int32Array(N);let head=0,tail=1;queue[0]=start;parent[start]=start;
 while(head<tail){const i=queue[head++]!,x=i%W,y=Math.floor(i/W);
  // Fixed N,E,S,W order and first-visit parents.
  for(const next of [y>96?i-W:-1,x<W-2?i+1:-1,y<H-2?i+W:-1,x>0?i-1:-1]){
   if(next>=0&&windows[next]&&parent[next]===-1){parent[next]=i;queue[tail++]=next;}
  }
 }return parent;
}
export function groundDistances(windows:Uint8Array,root:RecordPoint):Int32Array {
 const parents=groundReachParents(windows,root),d=new Int32Array(N);d.fill(-1);
 for(let i=0;i<N;i++)if(parents[i]===i)d[i]=0;
 for(let i=0;i<N;i++)if(parents[i]!==-1&&d[i]===-1){
  const stack:number[]=[];let j=i;while(d[j]===-1){stack.push(j);j=parents[j]!;}
  while(stack.length){const k=stack.pop()!;d[k]=d[parents[k]!]!+1;}
 }return d;
}
function index(p:RecordPoint):number{return p[1]*W+p[0];}

/** All-cell physical checks followed by hypothetical occupancy and connection-loss checks.
 * Provisional D0 limits only: intentionally cannot mint a production placementPolicy.
 * Bridges are not accepted until D3-C validates saved supports/deck/state.
 */
export function reviewGroundAccess(ctx:GroundReviewContext,purpose:GroundPurpose,objectId:string,plot:GroundPlot):GroundReview {
 if(ctx.historyStatus!=='known')return hold('unknown-history');
 if(!Number.isSafeInteger(ctx.year)||!Number.isSafeInteger(ctx.confirmedYear)||ctx.year<0||ctx.year>ctx.confirmedYear)return hold('unconfirmed-year');
 if(!validPlot(plot))return hold('outside-ground');
 if(ctx.occupancy.some(o=>!validPlot(o.plot)||!validPoint(o.entrance))||ctx.reservations.some(o=>!validPlot(o.plot)))throw Error('Invalid ground context');
 const r=decodeRecordPhysics(ctx.terrain.sites[ctx.site].physics),physical=reviewPhysicalPlot(r,purpose,plot);
 if(physical.status==='hold')return hold(physical.reason);
 if(purpose!=='field'){
  const water=(x:number,y:number)=>x>=0&&x<W&&y>=96&&y<H&&(r.surface[y*W+x]===2||r.surface[y*W+x]===3);
  for(let x=plot.x;x<plot.x+plot.width;x++)if(water(x,plot.y-1)||water(x,plot.y+plot.depth))return hold('water');
  for(let y=plot.y;y<plot.y+plot.depth;y++)if(water(plot.x-1,y)||water(plot.x+plot.width,y))return hold('water');
 }
 const conflicts=[...ctx.occupancy,...ctx.reservations.filter(o=>o.id!==objectId)].filter(o=>overlap(plot,o.plot)).map(o=>o.id);
 if(conflicts.length)return hold('occupied',[...new Set(conflicts)].sort());
 const entrance=southEntrance(plot),plots=ctx.occupancy.map(o=>o.plot);
 const before=groundReachParents(groundWalkWindows(r,plots),ctx.primaryRoot),after=groundReachParents(groundWalkWindows(r,[...plots,plot]),ctx.primaryRoot);
 if(!validPoint(entrance)||after[index(entrance)]===-1)return hold('no-access');
 for(const o of ctx.occupancy)if(before[index(o.entrance)]!==-1&&after[index(o.entrance)]===-1)return hold('no-access',[o.id]);
 const access:RecordPoint[]=[];let i=index(entrance);
 while(true){access.push([i%W,Math.floor(i/W)]);if(after[i]===i)break;i=after[i]!;}
 access.reverse();return {status:'clear',entrance,access,slopeCells:physical.slopeCells};
}
