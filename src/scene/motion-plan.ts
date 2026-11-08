/** Ephemeral, deterministic activities on a confirmed observation. Never saved. */
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import type {RecordPoint} from '../terrain/terrain-record-types.js';
import {readOwnedRecordPhysics,frozenRecordPhysics} from '../terrain/owned-record-physics.js';
import {groundContextWindows,groundDistances,southEntrance} from '../terrain/ground-access-review.js';
import {projectScenePaint,type ScenePaintProjection} from './draw-generated-review.js';
import {generatedSceneWalkContext} from './generated-presentation-review.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
export interface SceneJourney {readonly homeId:string;readonly targetId:string;readonly purpose:'field'|'market'|'workshop';readonly path:readonly RecordPoint[];readonly speed:number;readonly rest:number;readonly phase:number}
interface CachedRoutes {readonly key:string;readonly windows:Uint8Array;readonly journeys:readonly SceneJourney[]}
// One entry per immutable district physics: bounded memory, never annual history.
const recentRoutes=new WeakMap<object,CachedRoutes>();
export function sceneActivityCount(population:number,scale:0|1|2|3):number {return population<=0?0:Math.min([2,3,4,6][scale]!,Math.max(1,Math.ceil(Math.log2(1+population/1500))));}
export function planSceneMotion(o:GeneratedSceneObservation,paint?:ScenePaintProjection){
 if(paint&&paint.observation!==o)throw Error('Motion paint projection mismatch');
 const {ground:g,snapshot:s,composition:c}=o,{presentation,vegetation}=paint??projectScenePaint(o),trees=vegetation?.trees??presentation.trees,r=readOwnedRecordPhysics(g.terrain.sites[g.site].physics),ctx=generatedSceneWalkContext(o);
 const blockers=[...trees.map(t=>({x:t.point[0],y:t.point[1],width:2,depth:2})),...(presentation.cart?[presentation.cart]:[])],hash=(label:string,id:string)=>terrainHash(['scene-motion-v1',g.terrain.source.seed,g.site,label,id]);
 const objects=new Map(s.objects.map(b=>[b.id,b])),homes=[...g.facilities.filter(f=>f.purpose==='house'&&objects.has(f.id)&&objects.get(f.id)?.condition!=='ruined').map(f=>({id:f.id,entrance:southEntrance(f.plot)})),...c.residentialBlocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant').map(b=>({id:b.blockId,entrance:southEntrance(b.footprint)}))];
 const destinations=g.facilities.filter(f=>['field','market','workshop'].includes(f.purpose)&&objects.get(f.id)?.condition==='intact'),count=sceneActivityCount(c.population,c.scale);
 homes.sort((a,b)=>hash('home',a.id)-hash('home',b.id)||(a.id<b.id?-1:a.id>b.id?1:0));
 const physics=g.terrain.sites[g.site].physics,cacheable=frozenRecordPhysics(physics),key=JSON.stringify([g.terrain.source.seed,g.site,ctx.occupancy,ctx.crossings,blockers,homes,destinations,count]),cached=cacheable?recentRoutes.get(physics):undefined;
 let windows:Uint8Array,journeys:SceneJourney[];
 if(cached?.key===key){windows=cached.windows.slice();journeys=[...cached.journeys];}
 else{
 windows=groundContextWindows(r,ctx,blockers);journeys=[];const fields=new Map<string,Int32Array>();
 for(const home of homes){
  if(journeys.length>=count)break;
  const targets=[...destinations].sort((a,b)=>hash(home.id,a.id)-hash(home.id,b.id)||(a.id<b.id?-1:a.id>b.id?1:0));
  for(const target of targets){
   let distance=fields.get(target.id);if(!distance){distance=groundDistances(windows,southEntrance(target.plot));fields.set(target.id,distance);}
   let i=home.entrance[1]*320+home.entrance[0],d=distance[i]!;if(d<2||d>320)continue;
   const path:RecordPoint[]=[home.entrance];
   while(d>0){const x=i%320,y=Math.floor(i/320),next=[y>96?i-320:-1,x<318?i+1:-1,y<178?i+320:-1,x>0?i-1:-1].find(j=>j>=0&&distance![j]===d-1);if(next===undefined)throw Error('Motion route distance mismatch');i=next;d--;path.push([i%320,Math.floor(i/320)]);}
   const h=hash(home.id,target.id);journeys.push({homeId:home.id,targetId:target.id,purpose:target.purpose as SceneJourney['purpose'],path,speed:2+(h%3)*.25,rest:2+h%5,phase:h%127});break;
  }
 }
 if(cacheable)recentRoutes.set(physics,{key,windows:windows.slice(),journeys:Object.freeze(journeys.map(j=>Object.freeze({...j,path:Object.freeze(j.path.map(p=>Object.freeze([...p]) as RecordPoint))})))});
 }
 const idle=presentation.people.filter(([x,y])=>windows[y*320+x]).slice(0,Math.max(0,count-journeys.length));
 const water:{point:RecordPoint;phase:number}[]=[];
 for(let y=100;y<178;y+=4)for(let x=4;x<318;x+=6)if(r.surface[y*320+x]===2||r.surface[y*320+x]===3){const h=hash('water',x+','+y);water.push({point:[x,y],phase:h});}
 water.sort((a,b)=>a.phase-b.phase);const ripples:typeof water=[];for(const p of water){if(ripples.length===18)break;if(ripples.every(q=>Math.abs(q.point[0]-p.point[0])+Math.abs(q.point[1]-p.point[1])>=12))ripples.push(p);}
 const smoke=s.objects.filter(b=>b.kind==='workshop'&&b.condition==='intact'&&c.population>0).slice(0,2).map(b=>({x:b.x+10,y:b.y-32,phase:hash('smoke',b.id)%17}));
 if(presentation.fire)smoke.push({x:presentation.fire.x,y:presentation.fire.y-12,phase:0});
 return {journeys,idle,windows,trees,grass:(vegetation?.grass??[]).filter(p=>p.color!=='#8e856d').filter((_,i)=>i%67===0).slice(0,8),ripples,smoke,clouds:presentation.clouds,drought:presentation.drought,mirror:g.terrain.sites[g.site].render.mirrorX};
}
export function journeyAt(j:SceneJourney,seconds:number){
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid motion time');
 const steps=j.path.length-1,travel=steps/j.speed,cycle=j.rest+travel+4+travel,t=(seconds+j.phase)%cycle;let index:number,walking=false;
 if(t<j.rest)index=0;else if(t<j.rest+travel){index=Math.min(steps,Math.floor((t-j.rest)*j.speed));walking=true;}else if(t<j.rest+travel+4)index=steps;else{index=Math.max(0,steps-Math.floor((t-j.rest-travel-4)*j.speed));walking=true;}
 return {point:j.path[index]!,walking,step:walking?Math.floor(seconds*3)%2:0};
}
