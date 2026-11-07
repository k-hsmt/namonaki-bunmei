/** Sparse plant marks and rooted trees; this layer never changes land occupation. */
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import type {RecordPoint} from '../terrain/terrain-record-types.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';
export function projectVegetation(o:GeneratedSceneObservation){
 const {ground:g,snapshot:s,composition:c}=o,r=readOwnedRecordPhysics(g.terrain.sites[g.site].physics),live=new Set(s.objects.filter(b=>b.kind!=='field'||b.condition!=='ruined').map(b=>b.id));
 const occupied:GroundPlot[]=[...g.facilities.filter(p=>live.has(p.id)).map(p=>p.plot),...c.residentialBlocks.map(b=>b.footprint),...(s.publicSpaces??[]).filter(p=>p.condition==='used').map(p=>p.footprint),...g.bridges.flatMap(b=>[b.deck,...b.bankSupports])];
 const inside=(p:GroundPlot,x:number,y:number,pad=0)=>x>=p.x-pad&&x<p.x+p.width+pad&&y>=p.y-pad&&y<p.y+p.depth+pad;
 const clear=(x:number,y:number)=>x>=0&&x<320&&y>=96&&y<180&&r.surface[y*320+x]===1&&r.bearing[y*320+x]===0&&!occupied.some(p=>inside(p,x,y));
 const grass:{point:RecordPoint;color:string}[]=[],shrubs:{point:RecordPoint;rank:number}[]=[],trees:{point:RecordPoint;scale:number;rank:number}[]=[];
 for(const p of g.vegetation??[]){
  const hash=(n:number)=>terrainHash(['vegetation-display-v1',g.terrain.source.seed,g.site,p.index,n]);
  for(let n=0;n<4;n++){
   const h=hash(n),x=p.plot.x+h%8,y=p.plot.y+Math.floor(h/8)%p.plot.depth;if(!clear(x,y))continue;
   if(p.stage>0)grass.push({point:[x,y],color:p.stage===1?'#a4a77c':'#8e9c70'});
   else if(p.disturbedYear!==null&&s.year-p.disturbedYear<15)grass.push({point:[x,y],color:'#8e856d'});
   if(n===0&&p.stage===2&&h%3===0&&clear(x+2,y))shrubs.push({point:[x,y],rank:h});
   if(n===0&&p.stage>=3&&h%5===0&&r.grade[y*320+x]!<=1&&!occupied.some(q=>x>=q.x-12&&x<q.x+q.width+12&&y>=q.y-6&&y<q.y+q.depth+24))trees.push({point:[x,y],scale:(.45+(y-96)/160)*(p.stage===4?1:.62),rank:h});
  }
 }
 shrubs.sort((a,b)=>a.rank-b.rank);trees.sort((a,b)=>a.rank-b.rank);const selected:typeof trees=[];
 for(const t of trees){if(selected.length===22)break;if(selected.every(q=>Math.abs(q.point[0]-t.point[0])+Math.abs(q.point[1]-t.point[1])>=13))selected.push(t);}
 return {grass,shrubs:shrubs.slice(0,32),trees:selected.sort((a,b)=>a.point[1]-b.point[1]||a.point[0]-b.point[0])};
}
