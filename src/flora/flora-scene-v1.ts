/**
 * Issue #47 B2d: which plants a confirmed scene shows, and their pixels (rendererId flora-scene-v1).
 *
 * Plants follow the world's flora (local-flora-v1 communities, flora-growth-v1 stages of that year): a patch
 * shows a tree only when its stand has grown to a young (stage 3) or mature (stage 4) stand of its canopy form;
 * shrubs (stage 2) and grass (stage 1) otherwise. Placement, counts, spacing and sizes are the reviewed B1b
 * planting (Human review 2026-11): per-biome caps, dense forests (tree cap ×3, spacing 10 px, building margin
 * 6/8 px), the D full mix (each plant drawn by the A or the B painter, about half each, A undergrowth at 0.6×).
 * Roots, plots and physics are record coordinates; when the scene is mirrored a root at x appears at 318−x.
 * Pure functions of their inputs (terrain hashes only); appearance only, never read by history.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {BiomeKind} from '../climate/initial-climate-v1.js';
import {describeFloraPatch,type FloraPatch,type PlantArchetype} from './local-flora-v1.js';
import type {FloraPatchView} from './flora-growth-v1.js';
import {expressiveSprite,restrainedSprite,PLANT_VARIANTS,type PlantSprite,type SpriteStage} from './plant-sprites-v1.js';

export const FLORA_SCENE_RULE_ID='flora-scene-v1' as const;
/** Reviewed B1b caps per site (trees, undergrowth) and soil tint (colour, strength) per biome. */
export const BIOME_SCENE:Readonly<Record<BiomeKind,{trees:number;low:number;soil:string;strength:number}>>=Object.freeze({
 desert:{trees:3,low:28,soil:'#c7b17d',strength:.65},steppe:{trees:6,low:42,soil:'#b4a278',strength:.45},
 grassland:{trees:9,low:54,soil:'#a5a36c',strength:.37},temperate_forest:{trees:22,low:44,soil:'#71876d',strength:.3},
 tropical_rainforest:{trees:21,low:49,soil:'#597a5c',strength:.4},boreal_forest:{trees:19,low:35,soil:'#889184',strength:.32},
 tundra:{trees:0,low:38,soil:'#aaa9a0',strength:.45},
});
export const FOREST_BIOMES:readonly BiomeKind[]=Object.freeze(['temperate_forest','tropical_rainforest','boreal_forest']);
/** Forests use the reviewed dense preset; other biomes the B1b baseline. */
export const SCENE_DENSITY=Object.freeze({
 forest:Object.freeze({treeFactor:3,treeSpacing:10,structureMarginX:6,structureMarginY:8}),
 open:Object.freeze({treeFactor:1,treeSpacing:18,structureMarginX:18,structureMarginY:25}),
});
export const LOW_SPACING=7,LOW_TREE_CLEARANCE=10,ROOT_MARGIN=4;
/** D mix: A undergrowth is drawn at this fraction of its A size. */
export const MIXED_UNDERGROWTH_SCALE=.6;

export interface ScenePlot {readonly x:number;readonly y:number;readonly width:number;readonly depth:number}
export type ScenePainter='expressive'|'restrained';
export interface ScenePlant {readonly kind:'tree'|'low';readonly id:PlantArchetype;readonly x:number;readonly y:number;readonly stage:SpriteStage;readonly variant:number;readonly painter:ScenePainter}
export interface FloraScenePhysics {readonly surface:Uint8Array;readonly grade:Uint8Array;readonly bearing:Uint8Array}

const inside=(p:ScenePlot,x:number,y:number,mx:number,my:number)=>x>=p.x-mx&&x<p.x+p.width+mx&&y>=p.y-my&&y<p.y+p.depth+my;
const land=(r:FloraScenePhysics,x:number,y:number)=>x>=1&&x<319&&y>=98&&y<179&&r.surface[y*320+x]===1&&r.grade[y*320+x]!<2&&r.bearing[y*320+x]===0;

/**
 * Plants of one site in one confirmed year. `views` are flora-growth-v1 stages of that year; `occupied` are the
 * standing structures' footprints (record coordinates) and `physics` the year's terrain.
 */
export function planFloraScene(input:{seed:number;site:RecordSite;patches:readonly (FloraPatch|null)[];views:readonly (FloraPatchView|null)[];physics:FloraScenePhysics;occupied:readonly ScenePlot[]}):readonly ScenePlant[] {
 const {seed,site,patches,views,physics,occupied}=input;
 if(patches.length!==440||views.length!==440)throw Error('Flora scene needs 440 patches');
 const h=(...parts:(string|number)[])=>terrainHash([FLORA_SCENE_RULE_ID,seed,site,...parts]);
 interface Candidate {i:number;x:number;y:number;h:number;stage:number;d:ReturnType<typeof describeFloraPatch>}
 const candidates:Candidate[]=[];let landPatches=0,treeCap=0,lowCap=0;
 for(let i=0;i<440;i++){
  const p=patches[i],v=views[i];if(!p||!v)continue;
  const d=describeFloraPatch(p),forest=FOREST_BIOMES.includes(d.biome);
  landPatches++;treeCap+=BIOME_SCENE[d.biome].trees*(forest?SCENE_DENSITY.forest.treeFactor:1);lowCap+=BIOME_SCENE[d.biome].low;
  if(v.stage<1)continue;
  const hash=h(i),x=(i%40)*8+2+hash%5,y=96+Math.floor(i/40)*8+2+((hash>>>7)%4);
  if(!land(physics,x,y)||!land(physics,x+1,y)||!land(physics,x,y+1)||!land(physics,x+1,y+1))continue;
  if(occupied.some(o=>inside(o,x,y,ROOT_MARGIN,ROOT_MARGIN)))continue;
  candidates.push({i,x,y,h:hash,stage:v.stage,d});
 }
 // Caps are the reviewed per-site counts, weighted by the biome share of the site's land patches (transition worlds).
 treeCap=landPatches?Math.round(treeCap/landPatches):0;lowCap=landPatches?Math.round(lowCap/landPatches):0;
 const sorted=candidates.sort((a,b)=>a.h-b.h||a.i-b.i),trees:(ScenePlant&{spacing:number})[]=[],low:ScenePlant[]=[];
 const far=(list:readonly {x:number;y:number}[],c:{x:number;y:number},dist:number)=>list.every(p=>(p.x-c.x)**2+(p.y-c.y)**2>=dist*dist);
 const painter=(x:number,y:number):ScenePainter=>h('painter',y*320+x)%2?'expressive':'restrained';
 for(const c of sorted){
  if(trees.length>=treeCap)break;
  if(c.stage<3||!c.d.canopy)continue;
  const density=FOREST_BIOMES.includes(c.d.biome)?SCENE_DENSITY.forest:SCENE_DENSITY.open;
  if(occupied.some(o=>inside(o,c.x,c.y,density.structureMarginX,density.structureMarginY)))continue;
  if(!trees.every(t=>(t.x-c.x)**2+(t.y-c.y)**2>=Math.max(t.spacing,density.treeSpacing)**2))continue;
  trees.push({kind:'tree',id:c.d.canopy,x:c.x,y:c.y,stage:c.stage===3?'young':'mature',variant:c.h%PLANT_VARIANTS,painter:painter(c.x,c.y),spacing:density.treeSpacing});
 }
 for(const c of sorted){
  if(low.length>=lowCap)break;
  if(!far(trees,c,LOW_TREE_CLEARANCE)||!far(low,c,LOW_SPACING))continue;
  // Grass on young growth, the community's shrub once shrubs have grown, a shrub or herb under older stands.
  const pool=(c.stage===1?[c.d.herb]:c.stage===2?[c.d.shrub??c.d.herb]:[c.d.shrub,c.d.herb]).filter((a):a is PlantArchetype=>a!==null);
  if(!pool.length)continue;const id=pool[h('low',c.i)%pool.length]!;
  low.push({kind:'low',id,x:c.x,y:c.y,stage:c.stage===1?'young':'mature',variant:(c.h>>>5)%PLANT_VARIANTS,painter:painter(c.x,c.y)});
 }
 return Object.freeze([...trees.map(({spacing:_,...t})=>Object.freeze(t)),...low.map(p=>Object.freeze(p))]);
}

const sprites=new Map<string,PlantSprite>();
function spriteOf(p:ScenePlant):PlantSprite {
 const key=p.painter+'/'+p.id+'/'+p.stage+'/'+(p.painter==='restrained'?p.variant:0);let s=sprites.get(key);
 if(!s){s=p.painter==='expressive'?expressiveSprite(p.id,p.stage):restrainedSprite(p.id,p.stage,p.variant);sprites.set(key,s);}
 return s;
}
/** Screen scale of a plant by its root depth (B1b): A 0.45–0.73, B 0.58–1.00; A undergrowth ×0.6. */
export function plantScale(p:ScenePlant):number {
 const depth=(p.y-96)/84;
 return p.painter==='expressive'?(.45+.28*depth)*(p.kind==='low'?MIXED_UNDERGROWTH_SCALE:1):.58+.42*depth;
}

export interface FloraLayer {readonly rgba:Uint8ClampedArray;readonly root:Int16Array}
/**
 * Plants of one scene on a transparent 320×180 screen layer, drawn by root y (undergrowth before trees on a tie,
 * then x). `root[i]` is the root y of the plant visible at screen pixel i (−1 none). Sprites are never flipped.
 */
export function renderFloraLayer(plants:readonly ScenePlant[],mirror:boolean):FloraLayer {
 const rgba=new Uint8ClampedArray(57600*4),root=new Int16Array(57600).fill(-1);
 const ordered=[...plants].sort((a,b)=>a.y-b.y||Number(a.kind==='tree')-Number(b.kind==='tree')||a.x-b.x||a.id.localeCompare(b.id));
 for(const p of ordered){
  const s=spriteOf(p),k=plantScale(p),w=Math.max(1,Math.round(s.width*k)),hh=Math.max(1,Math.round(s.height*k));
  const left=Math.round((mirror?318-p.x:p.x)-s.originX*k),top=Math.round(p.y-s.originY*k);
  for(let y=Math.max(0,top);y<Math.min(180,top+hh);y++){
   const V=Math.floor((y-top+.5)*s.height/hh);
   for(let x=Math.max(0,left);x<Math.min(320,left+w);x++){
    const U=Math.floor((x-left+.5)*s.width/w),si=(V*s.width+U)*4;if(s.data[si+3]===0)continue;
    const di=y*320+x;rgba.set(s.data.subarray(si,si+4),di*4);root[di]=p.y;
   }
  }
 }
 return {rgba,root};
}

/**
 * Soil tint of each land pixel by its patch's biome (B1b colours), on a screen RGBA image. Record column x
 * appears at screen column 319−x when the scene is mirrored.
 */
export function tintFloraSoil(rgba:Uint8ClampedArray,patches:readonly (FloraPatch|null)[],physics:FloraScenePhysics,mirror:boolean):void {
 const colors=Object.fromEntries(Object.entries(BIOME_SCENE).map(([k,v])=>[k,[1,3,5].map(i=>parseInt(v.soil.slice(i,i+2),16))])) as Record<BiomeKind,number[]>;
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const rx=mirror?319-x:x,z=y*320+rx;if(physics.surface[z]!==1||physics.bearing[z]!==0)continue;
  const p=patches[Math.floor((y-96)/8)*40+Math.floor(rx/8)];if(!p)continue;
  const biome=describeFloraPatch(p).biome,col=colors[biome],a=BIOME_SCENE[biome].strength,i=(y*320+x)*4;
  for(let j=0;j<3;j++)rgba[i+j]=Math.round(rgba[i+j]!*(1-a)+col[j]!*a);
 }
}
