/**
 * Issue #35 D2-c: paints the recorded birth styles into the live generated scene (review only).
 * Plugs into drawGeneratedSceneReview's optional structure painter, so terrain, vegetation, people,
 * bridges and the drawing order stay exactly as in the live scene. Not used by the normal UI.
 *  - facilities: the D1 drawing at the live anchor and footprint clip, at D1 size (Human decision 1)
 *  - civic halls: the D1 hall widened to the civic plot (decision 4); courtyard-hall uses the D1
 *    courtyard composition at hall height
 *  - housing parts: architecture-miniature-v1 in the live roof-part grid (decision H1)
 *  - ruined buildings, fields and anything without a recorded birth: the live drawing, unchanged
 *  - damaged buildings: the live damage mark over the cultural drawing
 */
import {drawResidentialRoofs} from '../scene/draw.js';
import type {GeneratedStructurePainter} from '../scene/draw-generated-review.js';
import {drawArchitecture,type RectTarget} from './draw-v1.js';
import {drawMiniature} from './miniature-v1.js';
import type {BirthFeatures} from './grammar-v1.js';

const target=(c:CanvasRenderingContext2D):RectTarget=>({rect(x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}});
const partSize={far:[5,4],middle:[9,7],near:[13,10]} as const;

export function createArchitecturePainter(births:readonly BirthFeatures[]):GeneratedStructurePainter {
 // D4: a building may have several generations (rebuilds); the one shown is the latest built by the observed year
 const facilities=new Map<string,BirthFeatures[]>(),housing=new Map<string,BirthFeatures[]>();
 for(const b of births){
  const map=b.ref.kind==='facility'?facilities:housing,key=b.ref.kind==='facility'?b.ref.id:b.ref.blockId;
  const list=map.get(key)??[];list.push(b);map.set(key,list);
 }
 const latest=(list:readonly BirthFeatures[]|undefined,year:number,covers:(b:BirthFeatures)=>boolean=()=>true)=>{
  let best:BirthFeatures|undefined;for(const b of list??[])if(b.source.year<=year&&covers(b)&&(!best||b.source.year>=best.source.year))best=b;return best;};
 const housingBirth=(blockId:string,index:number,year:number)=>latest(housing.get(blockId),year,b=>b.ref.kind==='housing'&&b.ref.parts.from<=index&&index<b.ref.parts.to);
 return {
  residentialRoofs(c,scene,depth){
   const parts=scene.residentialBlocks.flatMap(b=>b.roofParts).filter(p=>p.depth===depth)
    .sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId));
   for(const p of parts){
    const index=Number(p.partId.slice(p.partId.lastIndexOf(':')+1)),birth=Number.isSafeInteger(index)?housingBirth(p.blockId,index,scene.year):undefined;
    if(!birth||p.condition==='ruined'){drawResidentialRoofs(c,{...scene,residentialBlocks:[{...scene.residentialBlocks[0]!,roofParts:[p]}]},depth);continue;}
    drawMiniature(target(c),{use:birth.use,...birth.features},p.x,p.y,depth);
    if(depth!=='far'&&p.condition==='damaged'){const [w,h]=partSize[depth];c.fillStyle='#4d504b';c.fillRect(Math.round(p.x-w/2),p.y-h+3,3,2);}
   }
  },
  facility(c,o,plot,year){
   if(o.kind==='field'||o.kind==='bridge'||o.condition==='ruined')return false;
   const birth=latest(facilities.get(o.id),year);if(!birth)return false;
   const spec={use:birth.use,...birth.features};
   if(o.civic){
    if(o.civic.architectureStyle==='courtyard-hall')drawArchitecture(target(c),{...spec,use:'courtyard'},o.x,o.y,{width:plot.width,height:15});
    else drawArchitecture(target(c),spec,o.x,o.y,{width:plot.width});
   }else drawArchitecture(target(c),spec,o.x,o.y);
   if(o.condition==='damaged'){c.fillStyle='#454e48';c.fillRect(o.x-6,o.y-2,6,2);}
   return true;
  },
 };
}
