/**
 * Issue #35 D2-c: paints the recorded birth styles into the live generated scene (review only).
 * Plugs into drawGeneratedSceneReview's optional structure painter, so terrain, vegetation, people,
 * bridges and the drawing order stay exactly as in the live scene. Not used by the normal UI.
 *  - facilities: the D1 drawing at the live anchor and footprint clip, at D1 size (Human decision 1)
 *  - civic halls: the D1 hall widened to the civic plot (decision 4); courtyard-hall uses the D1
 *    courtyard composition at hall height
 *  - housing parts: architecture-miniature-v1 in the live roof-part grid (decision H1)
 *  - ruined buildings (D4-b, Human decision 5 on D4): the ruin of the generation that stood there, in its
 *    own style (architecture-ruin-v1); fields and anything without a recorded birth: the live drawing
 *  - damaged buildings: the live damage mark over the cultural drawing
 */
import {drawResidentialRoofs} from '../scene/draw.js';
import type {GeneratedStructurePainter} from '../scene/draw-generated-review.js';
import {drawArchitecture,type RectTarget} from './draw-v1.js';
import {drawMiniature} from './miniature-v1.js';
import type {BirthFeatures} from './grammar-v1.js';

const target=(c:CanvasRenderingContext2D):RectTarget=>({rect(x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}});
const partSize={far:[5,4],middle:[9,7],near:[13,10]} as const;

// ---- architecture-ruin-v1 (D4-b): a ruin keeps the style of the generation that fell into ruin ----
const hex=/^#[0-9a-f]{6}$/i;
const mix=(a:string,b:string,t:number)=>{if(!hex.test(a))return a;const p=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),q=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
 return '#'+p.map((n,i)=>Math.round(n+(q[i]!-n)*t).toString(16).padStart(2,'0')).join('');};
/** Weathered: towards the dust of the ground, a little darker. Openings (very dark) stay as they are. */
const weather=(c:string)=>{if(!hex.test(c))return c;const v=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return v[0]!+v[1]!+v[2]!<200?c:mix(mix(c,'#8f8a76',.45),'#2c302c',.12);};
const ruinHash=(key:string,n:number)=>{let h=2166136261;for(const ch of key+':'+n){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)%100;};
/**
 * Draws `draw` as a ruin: roof and upper walls are gone above a broken line (40-65% of the height,
 * in 3 px steps fixed per building), what remains is weathered. Deterministic, read-only.
 */
export function drawRuin(g:RectTarget,key:string,draw:(t:RectTarget)=>void):void {
 const rects:[number,number,number,number,string][]=[];draw({rect:(x,y,w,h,col)=>{rects.push([x,y,w,h,col]);}});
 if(!rects.length)return;
 const top=Math.min(...rects.map(r=>r[1])),base=Math.max(...rects.map(r=>r[1]+r[3])),height=base-top;
 const cut=(x:number)=>base-Math.round(height*(40+ruinHash(key,Math.floor(x/3))%26)/100);
 for(const [x,y,w,h,col] of rects)for(let xi=Math.floor(x);xi<x+w;xi++){
  const y0=Math.max(y,cut(xi)),y1=y+h;if(y1>y0)g.rect(xi,y0,1,y1-y0,weather(col));
 }
}

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
    if(!birth){drawResidentialRoofs(c,{...scene,residentialBlocks:[{...scene.residentialBlocks[0]!,roofParts:[p]}]},depth);continue;}
    if(p.condition==='ruined'){drawRuin(target(c),p.partId,t=>drawMiniature(t,{use:birth.use,...birth.features},p.x,p.y,depth));continue;}
    drawMiniature(target(c),{use:birth.use,...birth.features},p.x,p.y,depth);
    if(depth!=='far'&&p.condition==='damaged'){const [w,h]=partSize[depth];c.fillStyle='#4d504b';c.fillRect(Math.round(p.x-w/2),p.y-h+3,3,2);}
   }
  },
  facility(c,o,plot,year){
   if(o.kind==='field'||o.kind==='bridge')return false;
   const birth=latest(facilities.get(o.id),year);if(!birth)return false;
   const spec={use:birth.use,...birth.features};
   const draw=(t:RectTarget)=>{
    if(o.civic){
     if(o.civic.architectureStyle==='courtyard-hall')drawArchitecture(t,{...spec,use:'courtyard'},o.x,o.y,{width:plot.width,height:15});
     else drawArchitecture(t,spec,o.x,o.y,{width:plot.width});
    }else drawArchitecture(t,spec,o.x,o.y);
   };
   if(o.condition==='ruined'){drawRuin(target(c),o.id,draw);return true;}
   draw(target(c));
   if(o.condition==='damaged'){c.fillStyle='#454e48';c.fillRect(o.x-6,o.y-2,6,2);}
   return true;
  },
 };
}
