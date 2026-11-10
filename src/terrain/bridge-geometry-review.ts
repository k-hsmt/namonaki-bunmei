/** D3-C horizontal single-span geometry and exact access-improvement review. */
import type {RecordPoint} from './terrain-record-types.js';
import {assertResolvedTerrain,assertTerrainPhysicalYear,type TerrainPhysicalSource} from './terrain-revision-v1.js';
import {decodeRecordPhysics,type RecordRaster} from './terrain-record-raster-v1.js';
import {validateRiverReaches,riverOwnershipRaster,riverJunctionExcludes,type ValidatedRiverReaches} from './river-reaches-review.js';
import {groundWalkWindows,groundContextWindows,groundDistances,reviewPhysicalPlot,southEntrance,type GroundPlot,type GroundReviewContext} from './ground-access-review.js';
import type {WalkableBridgeCrossing} from './bridge-access-types.js';
import {terrainHash} from './terrain-hash-v1.js';
export interface BridgeGeometryReview {
 readonly schemaVersion:1;readonly ruleId:'horizontal-span-review-v1';readonly siteId:'river-bank';
 readonly bridgeId:string;readonly axis:'horizontal';readonly streamId:string;
 readonly deck:GroundPlot;readonly bankSupports:readonly [GroundPlot,GroundPlot];
 readonly bankA:RecordPoint;readonly bankB:RecordPoint;
}
declare const verified:unique symbol;
export type ValidatedBridgeGeometry=BridgeGeometryReview&{readonly [verified]:true};
const W=320,N=57600;
const index=(p:RecordPoint)=>p[1]*W+p[0];
const intersects=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
const samePlot=(a:GroundPlot,b:GroundPlot)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.depth===b.depth;
function freeze<T>(v:T):T {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
interface StaticData {raster:RecordRaster;templates:readonly ValidatedBridgeGeometry[]}
const staticCache=new WeakMap<object,WeakMap<object,StaticData>>();
function staticData(t:TerrainPhysicalSource,h:ValidatedRiverReaches):StaticData {
 if(t.format==='resolved-terrain-at-year')assertResolvedTerrain(t);
 let byTerrain=staticCache.get(h);if(!byTerrain){byTerrain=new WeakMap();staticCache.set(h,byTerrain);}const hit=byTerrain.get(t);if(hit)return hit;
 const checked=validateRiverReaches(h,t),{owners,streamIds}=riverOwnershipRaster(checked,t),r=decodeRecordPhysics(t.sites['river-bank'].physics);
 const runs=(y:number)=>{
  const found:{left:number;right:number;owner:number}[]=[];let start=-1,owner=-1;
  for(let x=0;x<=W;x++){const next=x<W?owners[y*W+x]!:-1;
   if(next!==owner){if(owner>=0)found.push({left:start,right:x,owner});start=x;owner=next;}
  }return found;
 };
 const templates:ValidatedBridgeGeometry[]=[];
 for(let y=108;y<=170;y+=2){
  if(riverJunctionExcludes(checked,y,y+6))continue;
  const rows=Array.from({length:6},(_,n)=>runs(y+n));
  for(const center of rows[2]!){
   let left=center.left,right=center.right,valid=true;
   for(const row of rows){
    const matched=row.filter(p=>p.owner===center.owner&&p.left<center.right&&p.right>center.left);
    if(matched.length!==1){valid=false;break;}left=Math.min(left,matched[0]!.left);right=Math.max(right,matched[0]!.right);
   }
   if(!valid||right-left<6||right-left>56||left<4||right+4>W)continue;
   // The envelope must never scoop up a second parallel channel or an island
   // gap on another deck row, even when both channels have the same stream ID.
   if(rows.some(row=>row.filter(p=>p.left<right&&p.right>left).length!==1))continue;
   const a={x:left-4,y,width:4,depth:6},b={x:right,y,width:4,depth:6};
   if(reviewPhysicalPlot(r,'hall',a).status!=='clear'||reviewPhysicalPlot(r,'hall',b).status!=='clear')continue;
   if(Math.abs(r.elevation[a.y*W+a.x]!-r.elevation[b.y*W+b.x]!)>1)continue;
   // Each bank may approach from its north or south 2px portal. A curved
   // shoreline can flood one portal while the other remains stable land.
   for(const bankA of [southEntrance(a),[a.x+1,a.y-2] as const])for(const bankB of [southEntrance(b),[b.x+1,b.y-2] as const]){
    const geometry:BridgeGeometryReview={schemaVersion:1,ruleId:'horizontal-span-review-v1',siteId:'river-bank',bridgeId:'bridge-template',axis:'horizontal',streamId:streamIds[center.owner]!,
     deck:{x:left-4,y:y+1,width:right-left+8,depth:4},bankSupports:[a,b],bankA,bankB};
    templates.push(freeze(geometry) as ValidatedBridgeGeometry);
   }
  }
 }
 const data={raster:r,templates};byTerrain.set(t,data);return data;
}
export function bridgeOccupiedIds(id:string):readonly [string,string,string]{return [id+'/bank-a',id+'/bank-b',id+'/deck'];}
export function bridgeOccupancy(g:ValidatedBridgeGeometry){
 const ids=bridgeOccupiedIds(g.bridgeId);return [{id:ids[0],plot:g.bankSupports[0],entrance:g.bankA},{id:ids[1],plot:g.bankSupports[1],entrance:g.bankB},
  {id:ids[2],plot:g.deck,entrance:g.bankA}];
}
/** A hypothetical intact deck during proposal, or a verified intact saved bridge. */
export function bridgeCrossing(g:ValidatedBridgeGeometry):WalkableBridgeCrossing {
 return freeze({bridgeId:g.bridgeId,site:'river-bank',deck:g.deck,bankEntrances:[g.bankA,g.bankB] as const,occupiedIds:bridgeOccupiedIds(g.bridgeId)}) as WalkableBridgeCrossing;
}
export function validateBridgeGeometry(raw:unknown,t:TerrainPhysicalSource,h:ValidatedRiverReaches):ValidatedBridgeGeometry {
 const object=(v:unknown,keys:readonly string[]):Record<string,unknown>=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid bridge object');const o=v as Record<string,unknown>;
  if(Object.keys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)))throw Error('Unknown bridge fields');return o;
 };
 const g=object(raw,['schemaVersion','ruleId','siteId','bridgeId','axis','streamId','deck','bankSupports','bankA','bankB']);
 if(g.schemaVersion!==1||g.ruleId!=='horizontal-span-review-v1'||g.siteId!=='river-bank'||g.axis!=='horizontal'||typeof g.bridgeId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(g.bridgeId)||typeof g.streamId!=='string')throw Error('Unsupported bridge geometry');
 const plot=(p:unknown):GroundPlot=>{const o=object(p,['x','y','width','depth']);if(!Object.values(o).every(Number.isSafeInteger))throw Error('Noninteger bridge plot');return o as unknown as GroundPlot;};
 const point=(p:unknown):RecordPoint=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isSafeInteger))throw Error('Invalid bridge point');return p as unknown as RecordPoint;};
 if(!Array.isArray(g.bankSupports)||g.bankSupports.length!==2)throw Error('Invalid bridge supports');
 const deck=plot(g.deck),a=plot(g.bankSupports[0]),b=plot(g.bankSupports[1]),pa=point(g.bankA),pb=point(g.bankB);
 const match=staticData(t,h).templates.find(c=>c.streamId===g.streamId&&samePlot(c.deck,deck)&&samePlot(c.bankSupports[0],a)&&samePlot(c.bankSupports[1],b)&&c.bankA[0]===pa[0]&&c.bankA[1]===pa[1]&&c.bankB[0]===pb[0]&&c.bankB[1]===pb[1]);
 if(!match)throw Error('Bridge disagrees with saved water, banks, slope or junctions');return freeze({...match,bridgeId:g.bridgeId}) as ValidatedBridgeGeometry;
}
function coveredLand(distance:Int32Array,r:RecordRaster){
 const cells=new Uint8Array(N);
 for(let y=96;y<179;y++)for(let x=0;x<319;x++){
  const i=y*W+x;if(distance[i]!<0)continue;for(const j of [i,i+1,i+W,i+W+1])if(r.surface[j]===1)cells[j]=1;
 }return cells;
}
export function proposeBridgeGeometry(ctx:GroundReviewContext,h:ValidatedRiverReaches,accessRoots:readonly RecordPoint[],nucleus:RecordPoint,bridgeId:string,mode:'cached'|'reference'='cached'){
 assertTerrainPhysicalYear(ctx.terrain,ctx.year);
 if(!['cached','reference'].includes(mode))throw Error('Invalid bridge search mode');
 const metrics={staticCandidates:0,portalEvaluations:0,accessEvaluations:0,visitedVertices:0},hold=(reason:string)=>({status:'hold' as const,reason,metrics});
 if(ctx.site!=='river-bank')return hold('unsupported-bridge');
 if(ctx.historyStatus!=='known')return hold('unknown-history');
 if(!Number.isSafeInteger(ctx.year)||!Number.isSafeInteger(ctx.confirmedYear)||ctx.year<0||ctx.year>ctx.confirmedYear)return hold('unconfirmed-year');
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(bridgeId))throw Error('Invalid bridge ID');
 const validPlot=(p:GroundPlot)=>[p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)&&p.x>=0&&p.y>=96&&p.width>=2&&p.depth>=1&&p.x+p.width<=320&&p.y+p.depth<=180;
 const validPoint=(p:RecordPoint)=>p.length===2&&p.every(Number.isSafeInteger)&&p[0]>=0&&p[0]<=318&&p[1]>=96&&p[1]<=178;
 if(!validPoint(nucleus)||ctx.occupancy.some(o=>!validPlot(o.plot)||!validPoint(o.entrance))||ctx.reservations.some(o=>!validPlot(o.plot)))throw Error('Invalid bridge ground context');
 const {raster:r,templates}=staticData(ctx.terrain,h);metrics.staticCandidates=templates.length;
 if(!accessRoots.some(p=>p[0]===ctx.primaryRoot[0]&&p[1]===ctx.primaryRoot[1]))throw Error('Missing primary natural root');
 const terrainWindows=groundWalkWindows(r,[]);
 for(const root of accessRoots){
  const [x,y]=root;if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||x>318||y<96||y>178||!(x===0||x===318||y===96||y===178))throw Error('Natural root is not a 2px frame portal');
  const area=coveredLand(groundDistances(terrainWindows,root),r).reduce((a,b)=>a+b,0);if(area<128)throw Error('Natural root component is too small');
 }
 const before=groundContextWindows(r,ctx),old=groundDistances(before,ctx.primaryRoot),core=groundDistances(before,nucleus),natural=accessRoots.map(p=>groundDistances(before,p)),oldLand=coveredLand(old,r);
 const visits=(d:Int32Array)=>d.reduce((n,v)=>n+ +(v>=0),0);
 metrics.visitedVertices=visits(old)+visits(core)+natural.reduce((n,d)=>n+visits(d),0);
 const postCache=new Map<string,{ports:ReadonlySet<number>;preserves:boolean;improvement:number}>();
 let best:{geometry:ValidatedBridgeGeometry;improvement:number;coreDistance:number;span:number;tie:number}|null=null;
 for(const template of templates){
  const g=freeze({...template,bridgeId}) as ValidatedBridgeGeometry,parts=[...g.bankSupports,g.deck];
  if([...ctx.occupancy,...ctx.reservations.filter(o=>o.id!==bridgeId)].some(o=>parts.some(p=>intersects(p,o.plot))))continue;
  const ia=index(g.bankA),ib=index(g.bankB),left=old[ia]!>=0,right=old[ib]!>=0;
  if(left===right||!natural.some(d=>d[ia]!>=0)||!natural.some(d=>d[ib]!>=0))continue;
  metrics.portalEvaluations++;
  const key=g.deck.x+','+g.deck.y+','+g.deck.width;let post=mode==='cached'?postCache.get(key):undefined;
  if(!post){
   metrics.accessEvaluations++;
   const afterCtx={...ctx,occupancy:[...ctx.occupancy,...bridgeOccupancy(g)],crossings:[...(ctx.crossings??[]),bridgeCrossing(g)]};
   const after=groundDistances(groundContextWindows(r,afterCtx),ctx.primaryRoot);metrics.visitedVertices+=visits(after);
   const land=coveredLand(after,r);let improvement=0;for(let i=0;i<N;i++)if(land[i]&&!oldLand[i])improvement++;
   const ports=g.bankSupports.flatMap(p=>[southEntrance(p),[p.x+1,p.y-2] as const]).map(index).filter(i=>after[i]!>=0);
   post={ports:new Set(ports),preserves:!ctx.occupancy.some(o=>old[index(o.entrance)]!>=0&&after[index(o.entrance)]!<0),improvement};
   if(mode==='cached')postCache.set(key,post);
  }
  if(!post.ports.has(ia)||!post.ports.has(ib)||!post.preserves)continue;
  const improvement=post.improvement;
  if(!improvement)continue;
  const coreDistance=left?core[ia]!:core[ib]!,span=g.deck.width-8,tie=terrainHash(['bridge-review-v1',ctx.terrain.source.seed,ctx.site,bridgeId,g.deck.x,g.deck.y]);
  if(coreDistance<0)continue;
  if(!best||improvement>best.improvement||improvement===best.improvement&&(coreDistance<best.coreDistance||coreDistance===best.coreDistance&&(span<best.span||span===best.span&&(tie<best.tie||tie===best.tie&&(g.deck.y<best.geometry.deck.y||g.deck.y===best.geometry.deck.y&&g.deck.x<best.geometry.deck.x)))))best={geometry:g,improvement,coreDistance,span,tie};
 }
 return best?{status:'proposed' as const,...best,metrics}:hold('no-safe-bridge');
}
