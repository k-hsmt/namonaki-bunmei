/** D4-A view-only wear, vegetation and people on saved, reachable ground. */
import {groundWalkWindows,groundContextWindows,groundDistances,groundDistancesFromAny,southEntrance,type GroundReviewContext,type GroundPlot} from '../terrain/ground-access-review.js';
import {decodeRecordPhysics} from '../terrain/terrain-record-raster-v1.js';
import {bridgeOccupancy,bridgeCrossing} from '../terrain/bridge-geometry-review.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import type {RecordPoint} from '../terrain/terrain-record-types.js';
export function generatedSceneWalkContext(o:GeneratedSceneObservation):GroundReviewContext {
 const {ground:g,snapshot:s,composition:c}=o;
 return {terrain:g.terrain,site:g.site,year:s.year,confirmedYear:s.year,historyStatus:'known',primaryRoot:g.primaryRoot,reservations:[],
  occupancy:[...g.facilities.map(p=>({id:p.id,plot:p.plot,entrance:southEntrance(p.plot)})),
   ...c.residentialBlocks.map(b=>({id:b.blockId,plot:b.footprint,entrance:southEntrance(b.footprint)})),
   ...(s.publicSpaces??[]).map(p=>({id:p.id,plot:p.footprint,entrance:southEntrance(p.footprint)})),...g.bridges.flatMap(bridgeOccupancy),...(g.channelView?.geometry?.cells??[]).map(([x,y],i)=>({id:'waterway/'+i,plot:{x,y,width:1,depth:1},entrance:[x,y] as RecordPoint}))],
  crossings:g.bridges.filter(b=>s.objects.some(x=>x.id===b.bridgeId&&x.condition==='intact')).map(bridgeCrossing)};
}
export function presentationPeopleCount(population:number,epidemic:boolean):number {return population<=0?0:epidemic?1:Math.min(9,Math.max(1,2+Math.floor(Math.log2(Math.max(1,population)/1800))));}
export function projectGeneratedPresentation(o:GeneratedSceneObservation){
 const {ground:g,snapshot:s,composition:c}=o,r=decodeRecordPhysics(g.terrain.sites[g.site].physics),ctx=generatedSceneWalkContext(o),windows=groundContextWindows(r,ctx),distance=groundDistances(windows,g.primaryRoot);
 const hash=(label:string,x:number,y:number,phase=0)=>terrainHash([label,g.terrain.source.seed,g.site,phase,x,y]);
 const natural=groundWalkWindows(r,[]),trees:{point:RecordPoint;scale:number;rank:number}[]=[];
 for(let y=100;y<=160;y+=12)for(let x=10;x<310;x+=16)if(natural[y*320+x])trees.push({point:[x,y],scale:.5+(hash('tree-size',x,y)%3)*.15,rank:hash('tree-position',x,y)});
 trees.sort((a,b)=>a.rank-b.rank||a.point[1]-b.point[1]||a.point[0]-b.point[0]);
 const active=new Set(s.objects.filter(b=>b.condition!=='ruined'&&b.kind!=='bridge').map(b=>b.id));
 const facilities=g.facilities.filter(p=>active.has(p.id)).map(p=>southEntrance(p.plot)).filter(p=>distance[p[1]*320+p[0]]!>=0);
 const homes=c.residentialBlocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant').map(b=>southEntrance(b.footprint)).filter(p=>distance[p[1]*320+p[0]]!>=0);
 const anchors=[...facilities,...homes],candidates:{point:RecordPoint;rank:number}[]=[],phase=Math.floor(s.year/20);
 if(c.population>0&&anchors.length)for(let y=98;y<178;y+=2)for(let x=2;x<318;x+=2){
  const i=y*320+x;if(distance[i]!<0||!anchors.some(p=>Math.abs(x-p[0])+Math.abs(y-p[1])<=10))continue;
  candidates.push({point:[x,y],rank:hash('scene-people',x,y,phase)});
 }
 candidates.sort((a,b)=>a.rank-b.rank||a.point[1]-b.point[1]||a.point[0]-b.point[0]);
 let cart:GroundPlot|null=null;
 if(s.scars.includes('travel')&&c.population>0)for(const {point:[x,y]} of candidates){
  if(x+10>320||y+4>180)continue;const p={x,y,width:10,depth:4};
  if(ctx.occupancy.some(o=>x<o.plot.x+o.plot.width&&x+10>o.plot.x&&y<o.plot.y+o.plot.depth&&y+4>o.plot.y))continue;
  let clear=true;for(let dy=0;dy<4;dy++)for(let dx=0;dx<10;dx++){const i=(y+dy)*320+x+dx;if(r.surface[i]!==1||r.bearing[i]!==0||r.grade[i]!>1)clear=false;}
  if(clear){cart=p;break;}
 }
 const count=presentationPeopleCount(c.population,s.scars.includes('epidemic')),people:RecordPoint[]=[];
 for(const candidate of candidates){if(people.length>=count)break;
  const [x,y]=candidate.point;if(cart&&x<cart.x+cart.width&&x+2>cart.x&&y<cart.y+cart.depth&&y+2>cart.y)continue;
  if(people.every(p=>Math.abs(p[0]-x)+Math.abs(p[1]-y)>=6))people.push(candidate.point);}
 const wear:RecordPoint[]=[],seen=new Set<number>(),nearest=groundDistancesFromAny(windows,facilities);
 // Surface wear is presentation between existing anchors, never a road event.
 for(const home of homes.slice(0,3)){
  let i=home[1]*320+home[0],d=nearest[i]!;if(d<1||d>80)continue;
  while(d>0){
   if(d%4===0&&r.surface[i]===1&&!seen.has(i)){wear.push([i%320,Math.floor(i/320)]);seen.add(i);}
   const x=i%320,y=Math.floor(i/320),neighbors=[y>96?i-320:-1,x<318?i+1:-1,y<178?i+320:-1,x>0?i-1:-1];
   const next=neighbors.find(j=>j>=0&&nearest[j]===d-1);if(next===undefined)throw Error('Inconsistent generated walking distance');i=next;d--;
  }
 }
 const hall=s.objects.find(b=>b.kind==='hall'&&b.condition==='intact'),fire=s.scars.includes('fire')?s.objects.find(b=>b.condition==='damaged'&&b.kind!=='bridge'):undefined;
 return {trees:trees.slice(0,9).map(({point,scale})=>({point,scale})),people,wear,cart,
  clouds:[{x:18+hash('cloud-a',0,0)%65,y:23},{x:202+hash('cloud-b',0,0)%45,y:37}],
  festival:s.scars.includes('festival')&&hall?{x:hall.x,y:hall.y-18}:null,fire:fire?{x:fire.x,y:fire.y-2}:null,
  flood:s.scars.includes('flood')&&g.site==='river-bank',drought:s.scars.includes('drought')};
}
