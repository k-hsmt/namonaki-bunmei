/** Independent natural policy; source eligibility and candidate search are never part of observation. */
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {terrainCutContextsAtInternal} from './terrain-cut-context-internal.js';
import {resolveTerrainAtYear,type TerrainHistory} from './terrain-revision-v1.js';
import {proposeTerrainCut,commitTerrainCut,terrainCutProposalMetrics,type TerrainCutProposal,type TerrainCutContext} from './terrain-earthwork-v1.js';
import {decodeRecordPhysics} from './terrain-record-raster-v1.js';
import {groundContextWindows,groundDistances,southEntrance,reviewPhysicalPlot,type GroundPlot} from './ground-access-review.js';
import type {TerrainCutDecision} from './terrain-cut-rules-v1.js';
export async function decideNaturalTerrainCut(review:GeneratedFacilityReview,history:TerrainHistory,year:number):Promise<{history:TerrainHistory;decision:TerrainCutDecision}>{
 if(!Number.isSafeInteger(year)||year<=0||year>=10000||year%100||history.confirmedThrough!==year)throw Error('Invalid natural cut decision year');
 const metrics={enumerated:0,physicalEligible:0,accessChecks:0,holds:{} as Record<string,number>},hold=(reason:NonNullable<TerrainCutDecision['reason']>)=>({history,decision:{id:'terrain-review-'+year,year,outcome:'hold' as const,reason,fieldId:null,changeId:null,score:null,metrics}});
 if(history.events.length>=4)return hold('limit');if(history.events.some(e=>year-e.approvedYear<500))return hold('cooldown');
 const contexts=terrainCutContextsAtInternal(review,history,year);if(!contexts.length)return hold('no-continuous-field');
 const r=decodeRecordPhysics(resolveTerrainAtYear(history,year).sites['hill-side'].physics),candidates:{ctx:TerrainCutContext;plot:GroundPlot;volume:number;lowerDistance:number}[]=[];
 const overlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
 for(const ctx of contexts){
  const fieldEntrance=ctx.ground.occupancy.find(o=>o.id===ctx.field.id)!.entrance,distances=groundDistances(groundContextWindows(r,ctx.ground),fieldEntrance),occupied=[...ctx.ground.occupancy,...ctx.ground.reservations,...ctx.protectedPlots,...history.events.map(e=>({id:e.id,plot:e.bounds}))];
  for(let y=98;y+14<=178;y+=2)for(let x=2;x+26<=318;x+=2){
   metrics.enumerated++;const plot={x,y,width:26,depth:14},bounds={x:x-2,y:y-2,width:30,depth:18};if(occupied.some(o=>overlap(o.plot,bounds)))continue;
   const entry=southEntrance(plot),lowerDistance=distances[entry[1]*320+entry[0]]!;if(lowerDistance<0)continue;
   let low=255,high=0,sum=0,stable=true;
   for(let py=y;py<y+14;py++)for(let px=x;px<x+26;px++){const i=py*320+px,e=r.elevation[i]!;if(r.surface[i]!==1||r.bearing[i]!==0)stable=false;low=Math.min(low,e);high=Math.max(high,e);sum+=e;}
   if(!stable||low===high||high-low>2||reviewPhysicalPlot(r,'field',plot).status==='clear')continue;let volume=sum-low*364,apron=true;for(let py=y-1;py<=y+14;py++)for(let px=x-1;px<=x+26;px++){if(px>=x&&px<x+26&&py>=y&&py<y+14)continue;const cut=Math.max(0,r.elevation[py*320+px]!-low-1);if(cut>2)apron=false;volume+=cut;}if(!apron)continue;metrics.physicalEligible++;candidates.push({ctx,plot,volume,lowerDistance});
  }
 }
 candidates.sort((a,b)=>a.volume-b.volume||a.lowerDistance-b.lowerDistance||a.plot.y-b.plot.y||a.plot.x-b.plot.x||(a.ctx.field.id<b.ctx.field.id?-1:a.ctx.field.id>b.ctx.field.id?1:0));
 let best:{proposal:TerrainCutProposal;score:[number,number,number,number];fieldId:string}|undefined;
 for(const c of candidates){
  if(best&&(c.volume>best.score[0]||c.volume===best.score[0]&&c.lowerDistance>best.score[1]))break;
  metrics.accessChecks++;const proposal=await proposeTerrainCut(c.ctx,c.plot);if(proposal.status==='hold'){metrics.holds[proposal.reason]=(metrics.holds[proposal.reason]??0)+1;continue;}
  const score:[number,number,number,number]=[c.volume,terrainCutProposalMetrics(proposal).fieldWalkDistance,c.plot.y,c.plot.x];
  const cmp=best?score.reduce((n,value,i)=>n||value-best!.score[i]!,0):-1;
  if(!best||cmp<0||cmp===0&&c.ctx.field.id<best.fieldId)best={proposal,score,fieldId:c.ctx.field.id};
 }
 if(!best)return hold('no-safe-cut');const next=commitTerrainCut(best.proposal),change=next.events.at(-1)!;
 return {history:next,decision:{id:'terrain-review-'+year,year,outcome:'built',reason:null,fieldId:best.fieldId,changeId:change.id,score:best.score,metrics}};
}
