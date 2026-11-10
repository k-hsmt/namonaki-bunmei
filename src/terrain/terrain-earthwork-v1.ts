/** D4-A2 pure, bounded cut transaction. No event search, RNG, live session or storage. */
import {resolveTerrainAtYear,appendTerrainCutInternal,type TerrainHistory} from './terrain-revision-v1.js';
import {terrainRevisionCanonical,terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {decodeRecordPhysics,type RecordRaster} from './terrain-record-raster-v1.js';
import {groundContextWindows,groundReachParents,reviewPhysicalPlot,southEntrance,type GroundPlot,type GroundReviewContext} from './ground-access-review.js';
import type {TerrainCutChange,TerrainCellChange} from './terrain-change-types-v1.js';
export interface TerrainCutContext {
 readonly history:TerrainHistory;readonly ground:GroundReviewContext;
 readonly field:{readonly id:string;readonly plot:GroundPlot;readonly builtYear:number;readonly sourceRecordId:string};
 readonly causeRecordId:string;
 readonly protectedPlots:readonly {readonly id:string;readonly plot:GroundPlot}[];
}
export type TerrainCutHold='unconfirmed-year'|'unsupported-site'|'outside-ground'|'unchanged'|'unstable'|'cut-limit'|'water'|'occupied'|'no-access'|'limit';
export type TerrainCutProposal={readonly status:'hold';readonly reason:TerrainCutHold;readonly conflicts:readonly string[]}|{readonly status:'review-only';readonly change:TerrainCutChange};
const proposals=new WeakMap<object,{history:TerrainHistory;change:TerrainCutChange;result?:TerrainHistory}>();
const W=320,N=57600;
const overlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
const validId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=256;
const validPlot=(p:GroundPlot)=>p&&Object.keys(p).length===4&&['x','y','width','depth'].every(k=>Object.hasOwn(p,k))&&[p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)&&p.x>=0&&p.y>=96&&p.width>0&&p.depth>0&&p.x+p.width<=320&&p.y+p.depth<=180;
const pointIndex=(p:readonly number[])=>p[1]!*W+p[0]!;
const validPoint=(p:readonly number[])=>p.length===2&&p.every(Number.isSafeInteger)&&p[0]!>=0&&p[0]!<319&&p[1]!>=96&&p[1]!<179;
const hold=(reason:TerrainCutHold,conflicts:readonly string[]=[]):TerrainCutProposal=>Object.freeze({status:'hold',reason,conflicts:Object.freeze([...conflicts].sort())});
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function cell(r:RecordRaster,i:number):readonly [number,number,number,number]{return [r.surface[i]!,r.grade[i]!,r.bearing[i]!,r.elevation[i]!];}
function neighbors(i:number){const x=i%W,y=Math.floor(i/W);return [x>0?i-1:-1,x<319?i+1:-1,y>96?i-W:-1,y<179?i+W:-1].filter(n=>n>=0);}
/** All context values needed by the transaction are read before the asynchronous hash. */
export async function proposeTerrainCut(ctx:TerrainCutContext,requested:GroundPlot):Promise<TerrainCutProposal>{
 const {history,ground:g,field}=ctx,year=g.year;
 if(g.site!=='hill-side')return hold('unsupported-site');
 if(g.historyStatus!=='known'||!Number.isSafeInteger(year)||year!==history.confirmedThrough||year!==g.confirmedYear||year>=10000)return hold('unconfirmed-year');
 const view=resolveTerrainAtYear(history,year);if(g.terrain!==view)throw Error('Cut context requires the owned same-year terrain view');
 if(history.events.length>=4||history.events.some(e=>year-e.approvedYear<500))return hold('limit');
 if(!field||!validId(field.id)||!validId(field.sourceRecordId)||!validId(ctx.causeRecordId)||!validPlot(field.plot)||!Number.isSafeInteger(field.builtYear)||field.builtYear<0||field.builtYear>year||!g.occupancy.some(o=>o.id===field.id&&terrainRevisionCanonical(o.plot)===terrainRevisionCanonical(field.plot)))throw Error('Missing confirmed agricultural source');
 if(!validPoint(g.primaryRoot)||g.occupancy.some(o=>!o.id||!validPlot(o.plot)||!validPoint(o.entrance))||g.reservations.some(o=>!o.id||!validPlot(o.plot))||ctx.protectedPlots.some(o=>!o.id||!validPlot(o.plot)))throw Error('Invalid cut protection context');
 const plot={...requested};if(!validPlot(plot)||plot.width!==26||plot.depth!==14||plot.x%2||plot.y%2||plot.x<2||plot.y<98||plot.x+plot.width>318||plot.y+plot.depth>178)return hold('outside-ground');
 const bounds={x:plot.x-2,y:plot.y-2,width:plot.width+4,depth:plot.depth+4};if(bounds.width*bounds.depth>640)return hold('outside-ground');
 const conflicts=[...g.occupancy,...g.reservations,...ctx.protectedPlots,...history.events.map(e=>({id:e.id,plot:e.bounds}))].filter(o=>overlap(o.plot,bounds)).map(o=>o.id);if(conflicts.length)return hold('occupied',[...new Set(conflicts)]);
 const before=decodeRecordPhysics(view.sites['hill-side'].physics),after=decodeRecordPhysics(view.sites['hill-side'].physics);let target=255,high=0;
 for(let y=bounds.y;y<bounds.y+bounds.depth;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++){
  const i=y*W+x;if(before.surface[i]===2||before.surface[i]===3)return hold('water');if(before.surface[i]!==1||before.bearing[i]!==0)return hold('unstable');
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(Math.abs(dx)+Math.abs(dy)<=3&&x+dx>=0&&x+dx<W&&y+dy>=95&&y+dy<180){const s=before.surface[(y+dy)*W+x+dx];if(s===2||s===3)return hold('water');}
 }
 for(let y=plot.y;y<plot.y+plot.depth;y++)for(let x=plot.x;x<plot.x+plot.width;x++){const h=before.elevation[y*W+x]!;target=Math.min(target,h);high=Math.max(high,h);}
 if(high===target)return hold('unchanged');if(high-target>2)return hold('cut-limit');let cutVolume=0;
 for(let y=plot.y;y<plot.y+plot.depth;y++)for(let x=plot.x;x<plot.x+plot.width;x++){const i=y*W+x;cutVolume+=after.elevation[i]!-target;after.elevation[i]=target;}
 // Recompute every possibly affected grade, including the one-cell exterior ring.
 for(let y=bounds.y;y<bounds.y+bounds.depth;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++){const i=y*W+x;after.grade[i]=after.bearing[i]===2?2:after.surface[i]===1?Math.min(2,...neighbors(i).map(j=>Math.abs(after.elevation[i]!-after.elevation[j]!))):0;}
 if(reviewPhysicalPlot(after,'field',plot).status!=='clear')return hold('cut-limit');
 const old=groundReachParents(groundContextWindows(before,g),g.primaryRoot),next=groundReachParents(groundContextWindows(after,g,[plot]),g.primaryRoot),entrance=southEntrance(plot);
 if(!validPoint(entrance)||next[pointIndex(entrance)]===-1)return hold('no-access');
 const lost=g.occupancy.filter(o=>old[pointIndex(o.entrance)]!==-1&&next[pointIndex(o.entrance)]===-1).map(o=>o.id);if(lost.length)return hold('no-access',lost);
 for(const p of g.crossings?.flatMap(c=>c.bankEntrances)??[])if(old[pointIndex(p)]!==-1&&next[pointIndex(p)]===-1)return hold('no-access');
 const cells:TerrainCellChange[]=[];for(let y=bounds.y;y<bounds.y+bounds.depth;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++){const i=y*W+x,a=cell(before,i),b=cell(after,i);if(a.some((v,n)=>v!==b[n]))cells.push([i,...a,...b]);}
 const disturbedPatches=[...new Set(cells.filter(c=>c[4]!==c[8]).map(c=>Math.floor((Math.floor(c[0]/320)-96)/8)*40+Math.floor(c[0]%320/8)))].sort((a,b)=>a-b);
 const body=freeze({format:'terrain-cut-event-v1' as const,schemaVersion:1 as const,ruleId:'terrain-cut-review-v1' as const,id:'terrain-cut-'+year,site:'hill-side' as const,approvedYear:year,effectiveYear:year+1,parentRevision:view.revisionId,cause:{recordId:ctx.causeRecordId,fieldId:field.id,fieldSourceRecordId:field.sourceRecordId,fieldBuiltYear:field.builtYear},plot,bounds,targetElevation:target,cutVolume,cells,disturbedPatches});
 const revisionId=await terrainRevisionHash({baseHash:history.baseHash,...body}),change:TerrainCutChange=Object.freeze({...body,revisionId}),proposal=Object.freeze({status:'review-only' as const,change});proposals.set(proposal,{history,change});return proposal;
}
export function commitTerrainCut(proposal:TerrainCutProposal):TerrainHistory {
 const owned=proposals.get(proposal);if(!owned)throw Error('Unowned or unsuccessful terrain cut');return owned.result??=(appendTerrainCutInternal(owned.history,owned.change));
}
/** Reader replay of a saved candidate; never enumerates candidates or consumes RNG. */
export async function verifyTerrainCut(raw:unknown,ctx:TerrainCutContext):Promise<TerrainCutProposal>{
 const canonical=terrainRevisionCanonical(raw);if(canonical.length>100000||!raw||typeof raw!=='object'||!('plot'in raw))throw Error('Invalid terrain cut wire');
 const expected=await proposeTerrainCut(ctx,(raw as TerrainCutChange).plot);if(expected.status!=='review-only'||terrainRevisionCanonical(expected.change)!==canonical)throw Error('Terrain cut replay mismatch');return expected;
}
