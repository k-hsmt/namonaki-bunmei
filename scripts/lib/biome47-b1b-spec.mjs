/**
 * Issue #47 B1b — PURE REVIEW PLANNER ONLY; forced visual trial, NOT a climate/world generator.
 * No src imports. Reads *saved* ground physics and occupied footprints, never modifies them.
 * Identical species, roots, planting counts across painter A/B/C for fair rendering comparison.
 */
export const REVIEW_BIOMES=Object.freeze([
 {id:'desert',label:'砂漠・乾燥地',soil:'#c7b17d',strength:.65,trees:3,low:28,high:['savanna'],under:['dryShrub','herb']},
 {id:'steppe',label:'半乾燥地・ステップ',soil:'#b4a278',strength:.45,trees:6,low:42,high:['savanna','riparian'],under:['herb','dryShrub']},
 {id:'grassland',label:'草原・サバンナ',soil:'#a5a36c',strength:.37,trees:9,low:54,high:['savanna','deciduous'],under:['herb','shrub']},
 {id:'temperate_forest',label:'温帯林',soil:'#71876d',strength:.3,trees:22,low:44,high:['deciduous','evergreen','conifer'],under:['shrub','understory','herb']},
 {id:'tropical_rainforest',label:'熱帯雨林',soil:'#597a5c',strength:.4,trees:21,low:49,high:['tropical','evergreen'],under:['understory','shrub','wetland']},
 {id:'boreal_forest',label:'亜寒帯林',soil:'#889184',strength:.32,trees:19,low:35,high:['conifer','conifer','deciduous'],under:['moss','coldShrub','shrub']},
 {id:'tundra',label:'ツンドラ',soil:'#aaa9a0',strength:.45,trees:0,low:38,high:[],under:['coldShrub','moss','herb']},
]);
export const REVIEW_STYLES=Object.freeze([
 {id:'expressive',label:'A：表現力重視（PR #126）'},
 {id:'claude',label:'B：多様性重視（PR #127）'},
 {id:'hybrid',label:'C：近景・中遠景統合'},
 {id:'mixed',label:'D：A/B完全ミックス'}
]);
/** D: A undergrowth is drawn at this fraction of its A scale (Human request: A undergrowth is 3-4x taller than B). */
export const MIXED_UNDERGROWTH_SCALE=0.6;
export const REVIEW_SITES=Object.freeze([
 {id:'river-bank',label:'川辺'},{id:'hill-side',label:'丘陵'},{id:'coast-inlet',label:'入り江'}
]);
export const EXPRESSIVE_IDS=Object.freeze({
 deciduous:'deciduous',evergreen:'evergreen',conifer:'conifer',tropical:'tropical',
 savanna:'savanna',riparian:'riparian',dryShrub:'dry-shrub',coldShrub:'tundra-shrub',
 shrub:'bush',herb:'grass',understory:'fern',wetland:'reeds',moss:'moss'
});
const mix=(h,x)=>{h=Math.imul(h^x,0x9e3779b1);h^=h>>>16;return h>>>0};
export function reviewHash(seed,siteIndex,patchIndex,salt=0){
 let h=mix(0x85ebca6b,seed>>>0);h=mix(h,siteIndex+1);h=mix(h,patchIndex+1);
 return mix(h,salt+7);
}
const inside=(p,x,y,marginX=0,marginY=0)=>x>=p.x-marginX&&x<p.x+p.width+marginX&&y>=p.y-marginY&&y<p.y+p.depth+marginY;
const land=(physics,x,y)=>x>=1&&x<319&&y>=98&&y<179&&physics.surface[y*320+x]===1&&physics.grade[y*320+x]<2&&physics.bearing[y*320+x]===0;
export function nearFreshwater(physics,x,y){
 // Physical surface code 2 means freshwater; sea is 3. Saltwater is NEVER a freshwater oasis.
 for(let yy=Math.max(96,y-14);yy<Math.min(180,y+15);yy+=2)
  for(let xx=Math.max(0,x-14);xx<Math.min(320,x+15);xx+=2)
   if((xx-x)**2+(yy-y)**2<=14*14&&physics.surface[yy*320+xx]===2)return true;
 return false;
}
/**
 * D (complete mix): each plant independently uses the A or the B painter, about half and half,
 * from a dedicated hash of seed, site and its record root. Not tied to depth, kind or species.
 */
export function mixedPainter(seed,siteIndex,plant){
 if(!Number.isSafeInteger(plant?.x)||!Number.isSafeInteger(plant?.y))throw Error('Mixed painter needs a planned root');
 return reviewHash(seed,siteIndex,plant.y*320+plant.x,97)%2?'expressive':'claude';
}
export function planReviewPlants({physics,occupied,seed,siteIndex,biomeId}){
 if(!physics||physics.surface?.length!==57600||physics.grade?.length!==57600||physics.bearing?.length!==57600)
  throw Error('B1b requires the actual 320x180 saved terrain physics');
 if(!Number.isSafeInteger(seed)||seed<1||!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Invalid review context');
 const biome=REVIEW_BIOMES.find(x=>x.id===biomeId);if(!biome)throw Error('Unknown review biome '+biomeId);
 if(!Array.isArray(occupied))throw Error('Missing confirmed occupied plots');
 const candidates=[];
 for(let i=0;i<440;i++){
  const h=reviewHash(seed,siteIndex,i);
  const x=(i%40)*8+2+h%5,y=96+Math.floor(i/40)*8+2+((h>>>7)%4);
  if(!land(physics,x,y)||!land(physics,x+1,y)||!land(physics,x,y+1)||!land(physics,x+1,y+1))continue;
  if(occupied.some(p=>inside(p,x,y,4,4)))continue;
  candidates.push({x,y,h,patchIndex:i,fresh:nearFreshwater(physics,x,y)});
 }
 const trees=[],low=[],sorted=[...candidates].sort((a,b)=>a.h-b.h||a.patchIndex-b.patchIndex);
 const okDistance=(chosen,c,dist)=>chosen.every(p=>(p.x-c.x)**2+(p.y-c.y)**2>=dist*dist);
 for(const c of sorted){
  if(trees.length>=biome.trees)break;
  if(occupied.some(p=>inside(p,c.x,c.y,18,25)))continue;
  if(!okDistance(trees,c,18))continue;
  const group=biome.high;
  // A riverine tree is allowed near actual freshwater only, never near sea alone.
  let id=group[reviewHash(seed,siteIndex,c.patchIndex,31)%group.length];
  if(c.fresh&&reviewHash(seed,siteIndex,c.patchIndex,5)%4===0)id='riparian';
  else if(id==='riparian'&&!c.fresh)id=group.find(x=>x!=='riparian')??'savanna';
  trees.push({kind:'tree',id,x:c.x,y:c.y,variant:c.h%6,stage:c.h%7===0?'young':'mature',fresh:c.fresh});
 }
 for(const c of sorted){
  if(low.length>=biome.low)break;
  if(trees.some(t=>(t.x-c.x)**2+(t.y-c.y)**2<10*10))continue;
  if(!okDistance(low,c,7))continue;
  const pool=c.fresh&&biomeId!=='tundra'?[...biome.under,'wetland']:biome.under;
  const id=pool[reviewHash(seed,siteIndex,c.patchIndex,53)%pool.length];
  low.push({kind:'low',id,x:c.x,y:c.y,variant:(c.h>>>5)%6,stage:c.h%4===0?'young':'mature',fresh:c.fresh});
 }
 return Object.freeze({seed,siteIndex,biomeId,trees,low,counts:{trees:trees.length,low:low.length},habitats:{freshRoots:candidates.filter(c=>c.fresh).length,validCandidates:candidates.length}});
}
