/** Versioned growth: v2 anchors at homes; v3 also anchors at verified bridge ends. */
import type {GroundPlot,GroundPurpose,GroundReviewContext} from './ground-access-review.js';
import type {RecordPoint} from './terrain-record-types.js';
import {terrainHash} from './terrain-hash-v1.js';
export type GrowthPattern='organic-v2'|'organic-v3';
export const organicGrowthLimits=Object.freeze({horizontalGap:6,verticalGap:10,fieldGap:3,civicGap:8,localMin:14,localMax:32,branchMin:34,branchMax:56,maxWalk:80,coreCap:48});
export function organicPlotClear(p:GroundPlot,others:readonly GroundPlot[],purpose:GroundPurpose):boolean {
 const l=organicGrowthLimits,xgap=purpose==='field'?l.fieldGap:purpose==='civic'?l.civicGap:l.horizontalGap,ygap=purpose==='field'?l.fieldGap:l.verticalGap;
 return others.every(q=>{
  const dx=Math.max(q.x-p.x-p.width,p.x-q.x-q.width,0),dy=Math.max(q.y-p.y-p.depth,p.y-q.y-q.depth,0);
  return dx>=xgap||dy>=ygap;
 });
}
export interface OrganicAttraction {readonly anchor:RecordPoint;readonly anchors:readonly RecordPoint[];readonly minimum:number;readonly maximum:number}
export function organicAttraction(ctx:GroundReviewContext,purpose:GroundPurpose,id:string,nucleus:RecordPoint,neighbors:readonly RecordPoint[],pattern:GrowthPattern='organic-v2'):OrganicAttraction {
 // Only verified, currently walkable decks can seed a new bank neighborhood.
 // Candidate access still has to connect all the way to the original root.
 const portals:RecordPoint[]=pattern==='organic-v3'&&(purpose==='house'||purpose==='housing')?(ctx.crossings??[]).flatMap(c=>[...c.bankEntrances]):[];
 const ordered=[...neighbors,...portals].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 const ordinal=Number(id.match(/(\d+)$/)?.[1]??0),branch=(purpose==='housing'||purpose==='house')&&ordered.length>=3&&ordinal%4===0;
 const density=(p:RecordPoint)=>ctx.occupancy.reduce((n,o)=>{
  const x=o.plot.x+o.plot.width/2,y=o.plot.y+o.plot.depth/2;return n+Math.max(0,44-Math.abs(p[0]-x)-Math.abs(p[1]-y));
 },0);
 ordered.sort((a,b)=>{
  const outward=(p:RecordPoint)=>branch?-Math.min(80,Math.abs(p[0]-nucleus[0])+Math.abs(p[1]-nucleus[1])):0;
  return density(a)*4+outward(a)-density(b)*4-outward(b)||
   terrainHash(['organic-anchor-v2',ctx.terrain.source.seed,ctx.site,id,...a])-terrainHash(['organic-anchor-v2',ctx.terrain.source.seed,ctx.site,id,...b])||a[1]-b[1]||a[0]-b[0];
 });
 return {anchor:ordered[0]??nucleus,anchors:ordered.length?ordered:[nucleus],minimum:purpose==='field'?12:branch?organicGrowthLimits.branchMin:organicGrowthLimits.localMin,maximum:purpose==='field'?42:branch?organicGrowthLimits.branchMax:organicGrowthLimits.localMax};
}
/** Static repulsion is shared by the exact score and its admissible lower bound. */
export function organicDensityPenalty(p:GroundPlot,others:readonly GroundPlot[]):number {
 return others.reduce((n,q)=>{
  const dx=Math.max(q.x-p.x-p.width,p.x-q.x-q.width,0),dy=Math.max(q.y-p.y-p.depth,p.y-q.y-q.depth,0);
  return n+Math.max(0,30-dx-dy)*2;
 },0);
}
