/**
 * Issue #35 D2-c: paints the recorded birth styles into the live generated scene (review only).
 * Plugs into drawGeneratedSceneReview's optional structure painter, so terrain, vegetation, people,
 * bridges and the drawing order stay exactly as in the live scene. Not used by the normal UI.
 *  - facilities: the D1 drawing at the live anchor and footprint clip, at D1 size (Human decision 1)
 *  - civic halls: the D1 hall widened to the civic plot (decision 4); courtyard-hall uses the D1
 *    courtyard composition at hall height
 *  - housing parts: architecture-miniature-v1 in the live roof-part grid (decision H1)
 *  - vacant and ruined buildings (Issue #37 D2): the generation that stood there, weathered by ruin-weathering-v1 with
 *    clocks from the world's confirmed history (ruin-history-v1): fading, roof holes, moss, vines and sand from the year
 *    it was abandoned; a ruin first stands to the eaves, settles to the architecture-ruin-v1 outline and then lower,
 *    never to nothing. A ruin with no recorded change is drawn as the settled outline, its age not guessed.
 *    Fields and anything without a recorded birth: the live drawing
 *  - damaged buildings: the live damage mark over the cultural drawing
 */
import {drawResidentialRoofs} from '../scene/draw.js';
import type {GeneratedStructurePainter} from '../scene/draw-generated-review.js';
import {drawArchitecture,type RectTarget} from './draw-v1.js';
import {drawMiniature} from './miniature-v1.js';
import type {BirthFeatures} from './grammar-v1.js';
import {ruinAppearanceOf,settledRuinAppearance,drawWeatheredArchitecture,type RuinClimate,type RuinLook} from '../ruin/ruin-weathering-v1.js';
import {ruinClocksAt,type RuinTimelines} from '../ruin/ruin-history-v1.js';

const target=(c:CanvasRenderingContext2D):RectTarget=>({rect(x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}});
const partSize={far:[5,4],middle:[9,7],near:[13,10]} as const;

// ---- architecture-ruin-v1 (D4-b): a ruin keeps the style of the generation that fell into ruin ----
const hex=/^#[0-9a-f]{6}$/i;
const mix=(a:string,b:string,t:number)=>{if(!hex.test(a))return a;const p=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),q=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
 return '#'+p.map((n,i)=>Math.round(n+(q[i]!-n)*t).toString(16).padStart(2,'0')).join('');};
/** Weathered: towards the dust of the ground, a little darker. Openings (very dark) stay as they are. */
const weather=(c:string)=>{if(!hex.test(c))return c;const v=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return v[0]!+v[1]!+v[2]!<200?c:mix(mix(c,'#857f6c',.6),'#2c302c',.2);};
const RUBBLE=['#6e695b','#7f7867','#5e5a4f'];
const ruinHash=(key:string,n:number)=>{let h=2166136261;for(const ch of key+':'+n){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)%100;};
/**
 * architecture-ruin-v1, the reference outline of a settled ruin (Issue #35 D4-b). Since Issue #37 D2 the live scene
 * draws ruins with ruin-weathering-v1, which settles to this outline (same steps and hashes) and keeps the foundation.
 * Draws `draw` as a ruin: roof and upper walls are gone above a broken line (20-45% of the height
 * remains, in 3 px steps fixed per building), about a quarter of the steps have fallen almost to the
 * ground, what remains is weathered, and rubble lies along the base. Human feedback on D4-b: the first
 * version (40-65%) was not recognisable at a glance. Deterministic, read-only.
 */
export function drawRuin(g:RectTarget,key:string,draw:(t:RectTarget)=>void):void {
 const rects:[number,number,number,number,string][]=[];draw({rect:(x,y,w,h,col)=>{rects.push([x,y,w,h,col]);}});
 if(!rects.length)return;
 const top=Math.min(...rects.map(r=>r[1])),base=Math.max(...rects.map(r=>r[1]+r[3])),height=base-top;
 const cut=(x:number)=>{const n=Math.floor(x/3),h=ruinHash(key,n);
  return base-(h<25?Math.min(2,height):Math.round(height*(20+ruinHash(key+'~',n)%26)/100));};
 for(const [x,y,w,h,col] of rects)for(let xi=Math.floor(x);xi<x+w;xi++){
  const y0=Math.max(y,cut(xi)),y1=y+h;if(y1>y0)g.rect(xi,y0,1,y1-y0,weather(col));
 }
 const left=Math.floor(Math.min(...rects.map(r=>r[0]))),right=Math.ceil(Math.max(...rects.map(r=>r[0]+r[2])));
 for(let xi=left-1;xi<=right;xi++){const h=ruinHash(key+'#',xi);if(h<70)g.rect(xi,base-1-(h<20?1:0),1,1+(h<20?1:0),RUBBLE[h%3]!);}
}

/** What the painter needs to weather vacant and ruined buildings (Issue #37 D2). */
export interface ArchitectureRuinContext {readonly timelines:RuinTimelines;readonly climate:RuinClimate;readonly look:RuinLook}
/** Bound of the weathered-drawing cache (the scene draws each building several times: layer, ground lines, snow). */
const WEATHER_CACHE_LIMIT=4000;

export function createArchitecturePainter(births:readonly BirthFeatures[],ruins:ArchitectureRuinContext):GeneratedStructurePainter {
 // D4: a building may have several generations (rebuilds); the one shown is the latest built by the observed year
 const facilities=new Map<string,BirthFeatures[]>(),housing=new Map<string,BirthFeatures[]>();
 for(const b of births){
  const map=b.ref.kind==='facility'?facilities:housing,key=b.ref.kind==='facility'?b.ref.id:b.ref.blockId;
  const list=map.get(key)??[];list.push(b);map.set(key,list);
 }
 const latest=(list:readonly BirthFeatures[]|undefined,year:number,covers:(b:BirthFeatures)=>boolean=()=>true)=>{
  let best:BirthFeatures|undefined;for(const b of list??[])if(b.source.year<=year&&covers(b)&&(!best||b.source.year>=best.source.year))best=b;return best;};
 const housingBirth=(blockId:string,index:number,year:number)=>latest(housing.get(blockId),year,b=>b.ref.kind==='housing'&&b.ref.parts.from<=index&&index<b.ref.parts.to);
 const cache=new Map<string,[number,number,number,number,string][]>();
 /**
  * Draws a building of the observed year: as it is while in use, weathered while vacant or ruined. `where` names the
  * drawing (position, size, generation) so cached pixels are reused only for the very same building and year state.
  */
 const paint=(c:CanvasRenderingContext2D,key:string,kind:'housing'|'facility',year:number,condition:string,spec:BirthFeatures['features']&{use:BirthFeatures['use']},where:string,draw:(t:RectTarget)=>void)=>{
  const clocks=ruinClocksAt(kind==='housing'?ruins.timelines.housing.get(key.slice(0,key.lastIndexOf(':'))):ruins.timelines.facilities.get(key),year,kind);
  const ruined=condition==='ruined';
  if(!ruined&&clocks.abandonedYears===null){draw(target(c));return;}
  const settled=ruined&&clocks.ruinedYears===null;
  const id=key+'|'+where+'|'+(settled?'settled':clocks.abandonedYears+'/'+(ruined?clocks.ruinedYears:'-'));
  let rects=cache.get(id);
  if(!rects){
   const appearance=settled?settledRuinAppearance(spec,ruins.climate):ruinAppearanceOf(spec,{abandonedYears:clocks.abandonedYears,ruinedYears:ruined?clocks.ruinedYears:null},ruins.climate);
   const list:[number,number,number,number,string][]=[];
   drawWeatheredArchitecture({rect:(x,y,w,h,col)=>{list.push([x,y,w,h,col]);}},key,draw,appearance,ruins.look);
   if(cache.size>=WEATHER_CACHE_LIMIT)cache.clear();cache.set(id,rects=list);
  }
  for(const [x,y,w,h,col] of rects){c.fillStyle=col;c.fillRect(x,y,w,h);}
 };
 return {
  residentialRoofs(c,scene,depth){
   const parts=scene.residentialBlocks.flatMap(b=>b.roofParts).filter(p=>p.depth===depth)
    .sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId));
   for(const p of parts){
    const index=Number(p.partId.slice(p.partId.lastIndexOf(':')+1)),birth=Number.isSafeInteger(index)?housingBirth(p.blockId,index,scene.year):undefined;
    if(!birth){drawResidentialRoofs(c,{...scene,residentialBlocks:[{...scene.residentialBlocks[0]!,roofParts:[p]}]},depth);continue;}
    const spec={use:birth.use,...birth.features};
    paint(c,p.partId,'housing',scene.year,p.condition,spec,`${p.x},${p.y},${depth},${birth.source.year}`,t=>drawMiniature(t,spec,p.x,p.y,depth));
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
   paint(c,o.id,'facility',year,o.condition,spec,`${o.x},${o.y},${plot.width},${birth.source.year}`,draw);
   if(o.condition==='damaged'){c.fillStyle='#454e48';c.fillRect(o.x-6,o.y-2,6,2);}
   return true;
  },
 };
}
