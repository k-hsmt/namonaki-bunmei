/** Review-only intake, flat conveyance, occupation and pedestrian continuity. */
import {readOwnedTerrainRecord} from '../terrain/terrain-record.js';
import {rasterizeRecordShapes} from '../terrain/terrain-record-raster-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {validateRiverReaches,riverOwnershipRaster,riverJunctionExcludes} from '../terrain/river-reaches-review.js';
import {groundContextWindows,reviewPhysicalPlot,type GroundPlot} from '../terrain/ground-access-review.js';
import type {RecordPoint} from '../terrain/terrain-record-types.js';
import {irrigationLimits,type IrrigationContext,type IrrigationGeometry,type IrrigationField,type IrrigationIntake,type IrrigationProposal,type IrrigationHold,type IrrigationMetrics,type IrrigationDiagnostic} from './types-v1.js';
import {shortestSimpleRoutes,spend,type RouteBudget,type RouteGraph} from './route-search-v1.js';
export {irrigationLimits};export type * from './types-v1.js';
const W=320,N=57600,S=N,T=N+1;
const index=(p:RecordPoint)=>p[1]*W+p[0],point=(i:number):RecordPoint=>[i%W,Math.floor(i/W)];
function same(a:unknown,b:unknown):boolean {if(a===b)return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));}
function freeze<T>(v:T):T {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function plotValid(p:GroundPlot){return [p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)&&p.x>=0&&p.y>=96&&p.width>=1&&p.depth>=1&&p.x+p.width<=W&&p.y+p.depth<=180;}
function pointValid(p:RecordPoint,window=false){return p.length===2&&p.every(Number.isSafeInteger)&&p[0]>=0&&p[0]<(window?319:320)&&p[1]>=96&&p[1]<(window?179:180);}
function neighbors(i:number,minY=96):number[]{const x=i%W,y=Math.floor(i/W);return [y>minY?i-W:-1,x<319?i+1:-1,y<179?i+W:-1,x>0?i-1:-1].filter(n=>n>=0);}
function mark(mask:Uint8Array,p:GroundPlot){for(let y=p.y;y<p.y+p.depth;y++)mask.fill(1,y*W+p.x,y*W+p.x+p.width);}
function cells(path:readonly number[]):number[]{return [...new Set(path.flatMap(i=>[i,i+1]))].sort((a,b)=>a-b);}
function components(windows:Uint8Array,metrics:IrrigationMetrics){const labels=new Int32Array(N);labels.fill(-1);const queue=new Int32Array(N);let label=0;
 for(let i=96*W;i<N;i++){if(!windows[i]||labels[i]!==-1)continue;let head=0,tail=1;queue[0]=i;labels[i]=label;
  while(head<tail){const node=queue[head++]!;metrics.walkVisits++;for(const next of neighbors(node))if(windows[next]&&labels[next]===-1){labels[next]=label;queue[tail++]=next;}}label++;
 }return labels;
}
// Only deeply frozen, value-only descriptors can share verified static physics.
function immutable(value:unknown):boolean {return !value||typeof value!=='object'||Object.isFrozen(value)&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>'value' in d&&immutable(d.value));}
const staticCache=new WeakMap<object,WeakMap<object,ReturnType<typeof createStatic>>>();
function createStatic(terrain:ReturnType<typeof readOwnedTerrainRecord>,raw:IrrigationContext['hydrology']){
 const h=validateRiverReaches(raw,terrain),r=readOwnedRecordPhysics(terrain.sites['river-bank'].physics),ownership=riverOwnershipRaster(h,terrain);
 const physical=new Uint8Array(N),contacts=new Map<number,number[]>();
 for(let y=96;y<180;y++)for(let x=0;x<319;x++){const i=y*W+x;if([i,i+1].every(j=>r.surface[j]===1&&r.bearing[j]===0&&r.grade[j]===0)&&r.elevation[i]===r.elevation[i+1]){physical[i]=1;}}
 for(let i=96*W;i<N;i++)if(physical[i]){const wet=[...new Set([i,i+1].flatMap(j=>neighbors(j,95)).filter(j=>r.surface[j]===2))];if(wet.length)contacts.set(i,wet);}
 const shapeMasks=new Map(terrain.sites['river-bank'].shapes.filter(s=>s.kind==='freshwater').map(s=>[s.id,rasterizeRecordShapes([s],false).surface]));
 return {terrain,h,r,ownership,physical,contacts,shapeMasks};
}
function staticPhysics(terrain:ReturnType<typeof readOwnedTerrainRecord>,raw:IrrigationContext['hydrology']){let map=staticCache.get(terrain);if(!map){map=new WeakMap();staticCache.set(terrain,map);}const cached=map.get(raw);if(cached)return cached;const value=createStatic(terrain,raw);if(immutable(raw))map.set(raw,value);return value;}
function prepare(ctx:IrrigationContext){
 const g=ctx.ground;if(!g||!ctx.cause||!Number.isSafeInteger(ctx.cause.year)||ctx.cause.year!==g.year||typeof ctx.cause.recordId!=='string'||!ctx.cause.recordId.length)throw Error('Invalid irrigation cause');
 if(g.occupancy.some(o=>!o.id||!plotValid(o.plot)||!pointValid(o.entrance,true))||g.reservations.some(o=>!o.id||!plotValid(o.plot)))throw Error('Invalid irrigation occupation');
 if(new Set(g.occupancy.map(o=>o.id)).size!==g.occupancy.length)throw Error('Duplicate irrigation occupation');
 if(!ctx.roots.length||ctx.roots.some(p=>!pointValid(p,true))||!ctx.roots.some(p=>same(p,g.primaryRoot)))throw Error('Invalid irrigation access roots');
 const ids=new Set<string>();for(const f of ctx.fields){if(!f.id||ids.has(f.id)||!plotValid(f.plot)||!Number.isSafeInteger(f.builtYear)||f.builtYear<0||f.builtYear>g.year||!f.sourceRecordId||!g.occupancy.some(o=>o.id===f.id&&same(o.plot,f.plot)))throw Error('Invalid irrigation field');ids.add(f.id);}
 const terrain=readOwnedTerrainRecord(g.terrain),data=staticPhysics(terrain,ctx.hydrology),{r,physical}=data;
 for(const f of ctx.fields)if(reviewPhysicalPlot(r,'field',f.plot).status!=='clear')throw Error('Invalid irrigation field ground');
 const blocked=new Uint8Array(N);for(const o of [...g.occupancy,...g.reservations])mark(blocked,o.plot);
 const available=new Uint8Array(N);for(let i=96*W;i<N;i++)available[i]=+(physical[i]===1&&!blocked[i]&&!blocked[i+1]);
 return {...data,g,available};
}
type Prepared=ReturnType<typeof prepare>;
function intakes(p:Prepared,mask:Uint8Array,budget:RouteBudget):Map<number,IrrigationIntake>{
 const out=new Map<number,IrrigationIntake>();for(let i=96*W;i<N;i++){if(!mask[i])continue;
  let found:IrrigationIntake|undefined;for(const bank of [i,i+1])for(const water of neighbors(bank,95)){if(p.r.surface[water]!==2||riverJunctionExcludes(p.h,Math.floor(water/W),Math.floor(water/W)+1))continue;
   const streamId=p.ownership.streamIds[p.ownership.owners[water]!];if(!streamId)continue;
   const y=Math.floor(water/W),shape=p.terrain.sites['river-bank'].shapes.find(s=>s.kind==='freshwater'&&p.shapeMasks.get(s.id)![water]===2&&p.h.reaches.some(reach=>reach.parentShapeId===s.id&&reach.streamId===streamId&&y>=reach.fromY&&y<reach.toY));
   if(!shape)continue;const reach=p.h.reaches.find(q=>q.parentShapeId===shape.id&&q.streamId===streamId&&y>=q.fromY&&y<q.toY)!;
   if(p.contacts.get(i)?.some(j=>p.shapeMasks.get(shape.id)![j]!==2||p.ownership.streamIds[p.ownership.owners[j]!]!==streamId||Math.floor(j/W)<reach.fromY||Math.floor(j/W)>=reach.toY||riverJunctionExcludes(p.h,Math.floor(j/W),Math.floor(j/W)+1)))continue;
   const candidate:IrrigationIntake={water:point(water),bank:point(bank),head:p.r.elevation[bank]!,parentShapeId:reach.parentShapeId,streamId,fromY:reach.fromY,toY:reach.toY};
   if(!found||index(candidate.bank)<index(found.bank)||index(candidate.bank)===index(found.bank)&&index(candidate.water)<index(found.water))found=candidate;
  }
  if(found){if(!spend(budget))break;out.set(i,found);}
 }return out;
}
function graph(p:Prepared,field:IrrigationField,mask:Uint8Array,sources:Map<number,IrrigationIntake>):RouteGraph {
 const starts=[...sources.keys()].sort((a,b)=>index(sources.get(a)!.bank)-index(sources.get(b)!.bank)||a-b),target=new Uint8Array(N),own=new Uint8Array(N);mark(own,field.plot);
 const valid=(i:number)=>Boolean(mask[i]&&!own[i]&&!own[i+1]);
 for(let i=96*W;i<N;i++)if(valid(i))for(const cell of [i,i+1])if(neighbors(cell).some(j=>own[j]&&p.r.elevation[j]===p.r.elevation[i])){target[i]=1;break;}
 return {size:N+2,source:S,sink:T,neighbors(node){if(node===T)return [];if(node===S)return starts.filter(valid);if(!valid(node))return [];return [...(target[node]?[T]:[]),...neighbors(node).filter(j=>valid(j)&&!p.contacts.has(j)&&p.r.elevation[j]===p.r.elevation[node])];}};
}
function compareRoutes(a:readonly number[],b:readonly number[],sources:Map<number,IrrigationIntake>){let d=a.length-b.length||index(sources.get(a[1]!)!.bank)-index(sources.get(b[1]!)!.bank)||a[1]!-b[1]!;if(d)return d;
 const direction=(delta:number)=>delta===-W?0:delta===1?1:delta===W?2:3;
 for(let i=2;i<a.length-1;i++){d=direction(a[i]!-a[i-1]!)-direction(b[i]!-b[i-1]!);if(d)return d;}return a[1]!-b[1]!;
}
function walkGuard(p:Prepared,ctx:IrrigationContext,metrics:IrrigationMetrics){const before=groundContextWindows(p.r,p.g),labels=components(before,metrics),groups=new Map<number,number[]>();
 for(const root of ctx.roots){const i=index(root),label=labels[i]!;if(label<0)continue;const group=groups.get(label)??[];group.push(i);groups.set(label,group);}
 for(const o of p.g.occupancy){const i=index(o.entrance),label=labels[i]!;if(groups.has(label))groups.get(label)!.push(i);}
 return (occupied:readonly number[])=>{metrics.accessChecks++;const after=before.slice();for(const i of occupied){const x=i%W,y=Math.floor(i/W);for(const dy of [0,-1])for(const dx of [0,-1]){const a=x+dx,b=y+dy;if(a>=0&&a<319&&b>=96&&b<179)after[b*W+a]=0;}}
  const next=components(after,metrics);return [...groups.values()].every(group=>next[group[0]!]!>=0&&group.every(i=>next[i]===next[group[0]!]));
 };
}
function geometry(p:Prepared,ctx:IrrigationContext,field:IrrigationField,path:readonly number[],intake:IrrigationIntake):IrrigationGeometry {
 return freeze(structuredClone({schemaVersion:1,ruleId:'irrigation-geometry-review-v1',status:'review-only',waterContract:'bank-level-flat-v1',site:'river-bank',source:p.terrain.source,year:p.g.year,causeRecordId:ctx.cause.recordId,field,intake,path:path.map(point),cells:cells(path).map(point)}) as IrrigationGeometry);
}
/** Lower budgets may be used for controlled limit tests; callers cannot enlarge the versioned limits. */
export function proposeIrrigation(ctx:IrrigationContext,limits:{maxSearchStates?:number;maxCandidates?:number}={}):IrrigationProposal {
 const metrics:IrrigationMetrics={searchStates:0,intakes:0,fields:0,candidates:0,accessChecks:0,walkVisits:0,accessRejected:0},diagnostics:IrrigationDiagnostic[]=[],g=ctx.ground;
 const hold=(reason:IrrigationHold):IrrigationProposal=>{if(!diagnostics.length)diagnostics.push({year:g.year,causeRecordId:ctx.cause?.recordId??'',fieldId:null,reason,candidates:metrics.candidates});return {status:'hold',reason,metrics,diagnostics};};
 if(g.site!=='river-bank')return hold('unsupported-site');if(g.historyStatus!=='known')return hold('unknown-history');if(!Number.isSafeInteger(g.year)||!Number.isSafeInteger(g.confirmedYear)||g.year<0||g.year>g.confirmedYear)return hold('unconfirmed-year');
 const maximum=limits.maxSearchStates??irrigationLimits.maxSearchStates,maxCandidates=limits.maxCandidates??irrigationLimits.maxCandidates;
 if(!Number.isSafeInteger(maximum)||maximum<0||maximum>irrigationLimits.maxSearchStates||!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>irrigationLimits.maxCandidates||Object.keys(limits).some(k=>!['maxSearchStates','maxCandidates'].includes(k)))throw Error('Invalid irrigation search limits');
 const p=prepare(ctx);if(!ctx.fields.length)return hold('no-active-field');const budget:RouteBudget={used:0,limit:maximum,exhausted:false};
 const physicalIntakes=intakes(p,p.physical,budget);metrics.intakes=physicalIntakes.size;const sources=new Map([...physicalIntakes].filter(([i])=>p.available[i]));
 const checkAccess=walkGuard(p,ctx,metrics);let reason:IrrigationHold='no-flat-route';
 if(!physicalIntakes.size&&!budget.exhausted)return hold('no-owned-intake');
 for(const field of [...ctx.fields].sort((a,b)=>a.builtYear-b.builtYear||(a.id<b.id?-1:a.id>b.id?1:0))){
  if(!spend(budget))break;metrics.fields++;const startCount=metrics.candidates;reason='no-flat-route';
  const routes=shortestSimpleRoutes(graph(p,field,p.available,sources),budget,(a,b)=>compareRoutes(a,b,sources));let found=false;
  for(const route of routes){found=true;const path=route.slice(1,-1);if(path.length>irrigationLimits.maxLength){reason='too-long';break;}
   if(metrics.candidates>=maxCandidates){budget.exhausted=true;break;}metrics.candidates++;
   if(checkAccess(cells(path))){metrics.searchStates=budget.used;return {status:'proposed',geometry:geometry(p,ctx,field,path,sources.get(path[0]!)!),metrics,diagnostics};}
   metrics.accessRejected++;reason='access-loss';if(metrics.candidates>=maxCandidates){budget.exhausted=true;break;}
  }
  if(!found&&!budget.exhausted){const it=shortestSimpleRoutes(graph(p,field,p.physical,physicalIntakes),budget,(a,b)=>compareRoutes(a,b,physicalIntakes));if(it.next().value)reason='occupied';}
  diagnostics.push({year:g.year,causeRecordId:ctx.cause.recordId,fieldId:field.id,reason:budget.exhausted?'search-limit':reason,candidates:metrics.candidates-startCount});if(budget.exhausted)break;
 }
 metrics.searchStates=budget.used;return hold(budget.exhausted?'search-limit':reason);
}
/** Revalidate the stored route, without new route search or adopting a production policy. */
export function validateIrrigationGeometry(raw:unknown,ctx:IrrigationContext):IrrigationGeometry {
 if(ctx.ground.site!=='river-bank'||ctx.ground.historyStatus!=='known'||!Number.isSafeInteger(ctx.ground.year)||!Number.isSafeInteger(ctx.ground.confirmedYear)||ctx.ground.year<0||ctx.ground.year>ctx.ground.confirmedYear)throw Error('Unconfirmed irrigation context');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid irrigation geometry');const q=raw as IrrigationGeometry,keys=['schemaVersion','ruleId','status','waterContract','site','source','year','causeRecordId','field','intake','path','cells'];
 if(Object.keys(q).length!==keys.length||keys.some(k=>!Object.hasOwn(q,k))||q.schemaVersion!==1||q.ruleId!=='irrigation-geometry-review-v1'||q.status!=='review-only'||q.waterContract!=='bank-level-flat-v1'||q.site!=='river-bank'||q.year!==ctx.ground.year||q.causeRecordId!==ctx.cause.recordId||!same(q.source,ctx.ground.terrain.source))throw Error('Unknown irrigation geometry or source');
 const p=prepare(ctx),field=ctx.fields.find(f=>f.id===q.field?.id);if(!field||!same(field,q.field)||!Array.isArray(q.path)||q.path.length<1||q.path.length>irrigationLimits.maxLength||q.path.some(v=>!Array.isArray(v)||!pointValid(v as unknown as RecordPoint)))throw Error('Invalid irrigation target or path');
 const path=q.path.map(index);if(new Set(path).size!==path.length||!same(q.cells,cells(path).map(point)))throw Error('Invalid irrigation cells');
 const sources=intakes(p,p.available,{used:0,limit:N,exhausted:false}),start=sources.get(path[0]!);if(!start||!same(start,q.intake))throw Error('Invalid irrigation intake');const gr=graph(p,field,p.available,sources);
 for(let i=0;i<path.length;i++){const node=path[i]!;if(!p.available[node]||p.r.elevation[node]!==start.head||i>0&&!gr.neighbors(path[i-1]!).includes(node))throw Error('Invalid conveyance');}
 if(!gr.neighbors(path[path.length-1]!).includes(T))throw Error('Missing irrigation outlet');
 const metrics:IrrigationMetrics={searchStates:0,intakes:0,fields:0,candidates:0,accessChecks:0,walkVisits:0,accessRejected:0};if(!walkGuard(p,ctx,metrics)(cells(path)))throw Error('Irrigation loses pedestrian access');return geometry(p,ctx,field,path,start);
}
