/** D3-A year-zero feasibility review. Results are proposals, never construction history. */
import type {ValidatedTerrainRecord} from './terrain-record.js';
import type {RecordPoint,RecordSite} from './terrain-record-types.js';
import {decodeRecordPhysics} from './terrain-record-raster-v1.js';
import {terrainHash} from './terrain-hash-v1.js';
import {groundWalkWindows,groundDistances,reviewPhysicalPlot,reviewGroundAccess,southEntrance,type GroundPlot} from './ground-access-review.js';
const W=320,N=57600;
const point=(i:number):RecordPoint=>[i%W,Math.floor(i/W)];
const index=(p:RecordPoint)=>p[1]*W+p[0];
const boundary=(i:number)=>i%W===0||i%W===318||Math.floor(i/W)===96||Math.floor(i/W)===178;
export interface InitialAccessProposal {
 readonly status:'review-only';readonly site:RecordSite;readonly nucleus:RecordPoint;readonly primaryRoot:RecordPoint;
 readonly accessRoots:readonly RecordPoint[];readonly house:GroundPlot;readonly field:GroundPlot;
 readonly trials:{readonly house:number;readonly field:number};
}
export function proposeInitialAccess(terrain:ValidatedTerrainRecord,site:RecordSite):InitialAccessProposal|{status:'hold';reason:'no-safe-plot';trials:{house:number;field:number}} {
 const raster=decodeRecordPhysics(terrain.sites[site].physics),windows=groundWalkWindows(raster,[]);
 const seen=new Uint8Array(N),components:{area:number;first:number;roots:number[];members:Set<number>}[]=[];
 for(let i=96*W;i<N;i++)if(windows[i]&&!seen[i]){
  const queue=[i],members=new Set<number>(),cells=new Set<number>(),roots:number[]=[];seen[i]=1;
  for(let head=0;head<queue.length;head++){
   const j=queue[head]!;members.add(j);for(const c of [j,j+1,j+W,j+W+1])cells.add(c);
   if(boundary(j))roots.push(j);
   for(const k of [j-W,j+1,j+W,j-1])if(k>=0&&k<N&&windows[k]&&!seen[k]){seen[k]=1;queue.push(k);}
  }
  roots.sort((a,b)=>a-b);if(roots.length&&cells.size>=128)components.push({area:cells.size,first:i,roots,members});
 }
 components.sort((a,b)=>b.area-a.area||a.first-b.first);
 const houses:GroundPlot[]=[],fields:GroundPlot[]=[];
 for(let y=96;y<174;y+=2)for(let x=2;x+18<=320;x+=2){const p={x,y,width:18,depth:7};if(reviewPhysicalPlot(raster,'house',p).status==='clear')houses.push(p);}
 for(let y=96;y+14<=180;y+=2)for(let x=2;x+26<=320;x+=2){const p={x,y,width:26,depth:14};if(reviewPhysicalPlot(raster,'field',p).status==='clear')fields.push(p);}
 const waterDistance=new Int32Array(N);waterDistance.fill(N);const waterQueue:number[]=[];
 for(let i=96*W;i<N;i++)if(raster.surface[i]===2||raster.surface[i]===3){waterDistance[i]=0;waterQueue.push(i);}
 for(let head=0;head<waterQueue.length;head++){
  const i=waterQueue[head]!,x=i%W,y=Math.floor(i/W);
  for(const j of [y>96?i-W:-1,x<319?i+1:-1,y<179?i+W:-1,x>0?i-1:-1])if(j>=0&&waterDistance[j]!>waterDistance[i]!+1){waterDistance[j]=waterDistance[i]!+1;waterQueue.push(j);}
 }
 const trials={house:0,field:0};
 if(!houses.length||!fields.length)return {status:'hold',reason:'no-safe-plot',trials};
 for(const component of components){
  const coords=[...component.members].map(point),cx=Math.round(coords.reduce((s,p)=>s+p[0],0)/coords.length),cy=Math.round(coords.reduce((s,p)=>s+p[1],0)/coords.length);
  const sorted=houses.filter(p=>component.members.has(index(southEntrance(p)))).map(p=>{
   let water=N;for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++)water=Math.min(water,waterDistance[y*W+x]!);
   const preference=waterQueue.length?(water>=8&&water<=32?0:1):Math.abs(p.x+9-cx)+Math.abs(p.y+3-cy);
   return {p,preference,tie:terrainHash(['initial-access-review-v1',terrain.source.seed,'house',site,'0',p.x,p.y])};
  }).sort((a,b)=>a.preference-b.preference||a.tie-b.tie||a.p.y-b.p.y||a.p.x-b.p.x);
  for(const {p:house} of sorted){
   trials.house++;const entrance=southEntrance(house),afterHouse=groundWalkWindows(raster,[house]);
   const d=groundDistances(afterHouse,entrance);
   const roots=component.roots.filter(i=>d[i]!==-1).sort((a,b)=>d[a]!-d[b]!||a-b);if(!roots.length)continue;
   const primaryRoot=point(roots[0]!);
   const context={terrain,site,year:0,confirmedYear:0,historyStatus:'known' as const,primaryRoot,occupancy:[],reservations:[]};
   if(reviewGroundAccess(context,'house','initial-house',house).status!=='clear')continue;
   // Feasibility only: closest physical field first. Final facility score belongs to D3-A search.
   const fieldCandidates=fields.filter(p=>d[index(southEntrance(p))]!>=0).sort((a,b)=>{
    const ea=southEntrance(a),eb=southEntrance(b);return d[index(ea)]!-d[index(eb)]!||a.y-b.y||a.x-b.x;
   });
   for(const field of fieldCandidates){
    trials.field++;
    const result=reviewGroundAccess({...context,occupancy:[{id:'initial-house',plot:house,entrance}]},'field','initial-field',field);
    if(result.status==='clear')return {status:'review-only',site,nucleus:entrance,primaryRoot,
     accessRoots:components.map(c=>c===component?primaryRoot:point(c.roots[0]!)),house,field,trials};
   }
  }
 }return {status:'hold',reason:'no-safe-plot',trials};
}
