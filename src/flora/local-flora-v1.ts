/**
 * Issue #47 B2b: each district patch's local habitat and initial plant community (ruleId local-flora-v1).
 *
 * A pure function of the world seed, its initial climate (initial-climate-v1) and the INITIAL terrain record
 * (year 0, before any earthwork). It reads no civilisation RNG and feeds no terrain, settlement, economy or
 * drawing yet (drawing is B2d). Same patch grid as the #32 vegetation: 3 sites × 440 patches of 8×8 px.
 *
 * The community is what can grow on the patch's land. Occupation by buildings changes over the years and is
 * applied as yearly state (B2c) and when drawing (B2d), so an abandoned plot can regrow its own community.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {BIOME_KINDS,CLIMATE_TRANSITION_MARGIN,type BiomeKind,type WorldClimateBaseline} from '../climate/initial-climate-v1.js';

export const FLORA_RULE_ID='local-flora-v1' as const;
export const FLORA_SITES=['river-bank','hill-side','coast-inlet'] as const satisfies readonly RecordSite[];
/** The 13 plant forms reviewed in Issue #47 B1a (B1a review document, §3), same ids and order. */
export const PLANT_ARCHETYPES=['deciduous','evergreen','conifer','tropical','savanna','riparian','dryShrub','coldShrub','shrub','herb','understory','wetland','moss'] as const;
export type PlantArchetype=typeof PLANT_ARCHETYPES[number];
export const GROUND_MATERIALS=['sand','rock','bareSoil','leafLitter','wetSoil','coldGround'] as const;
export type GroundMaterial=typeof GROUND_MATERIALS[number];
export const HABITATS=['ordinary','riparian','wetland','coastal','rocky'] as const;
export type Habitat=typeof HABITATS[number];

/** [habitat, biome, canopy (-1 none), shrub (-1 none), herb (-1 none), ground, initial age (years), establishment potential 0..100] */
export type FloraPatch=readonly [number,number,number,number,number,number,number,number];
export interface LocalFlora {readonly schemaVersion:1;readonly ruleId:typeof FLORA_RULE_ID;readonly sites:Readonly<Record<RecordSite,readonly (FloraPatch|null)[]>>}

/** Local-habitat thresholds (B2b parameters, docs/issue47-b2-plan.md §5). Distances are Manhattan pixels. */
// Measured on generated worlds (B2b): slopes occur only on the hill site and are gentle (grade 2 is ~1% of its land,
// patch mean grade stays below 1.5); no cliffs or sandbars appeared in the sampled worlds but are honoured if present.
export const HABITAT_LIMITS=Object.freeze({rockyCliffShare:.25,rockySteepShare:.2,rockyMeanGrade:1,wetlandFresh:3,wetlandShare:.6,wetlandMeanGrade:.5,riparianFresh:12,coastalSea:10,coastalSandbarShare:.25});
/** Share (%) of patches that take the neighbouring biome in a transition world, by distance 1..4. */
export const TRANSITION_PATCH_SHARE=Object.freeze([48,36,24,12]);

/** Biome recipes, from the reviewed B1b forced-biome planting (docs/issue47-b1b-scene-comparison.md). */
const RECIPES:Readonly<Record<BiomeKind,{canopy:readonly PlantArchetype[];shrub:readonly PlantArchetype[];herb:readonly PlantArchetype[];ground:GroundMaterial;potential:number}>>={
 desert:{canopy:['savanna'],shrub:['dryShrub'],herb:['herb'],ground:'sand',potential:10},
 steppe:{canopy:['savanna'],shrub:['dryShrub'],herb:['herb'],ground:'bareSoil',potential:20},
 grassland:{canopy:['savanna','deciduous'],shrub:['shrub'],herb:['herb'],ground:'bareSoil',potential:35},
 temperate_forest:{canopy:['deciduous','evergreen','conifer'],shrub:['shrub'],herb:['understory','herb'],ground:'leafLitter',potential:85},
 tropical_rainforest:{canopy:['tropical','evergreen'],shrub:['shrub'],herb:['understory','wetland'],ground:'wetSoil',potential:90},
 boreal_forest:{canopy:['conifer','conifer','deciduous'],shrub:['coldShrub','shrub'],herb:['moss'],ground:'leafLitter',potential:80},
 tundra:{canopy:[],shrub:['coldShrub'],herb:['moss','herb'],ground:'coldGround',potential:0},
};
const HABITAT_POTENTIAL:Readonly<Record<Habitat,number>>={ordinary:0,riparian:30,wetland:-40,coastal:-15,rocky:-35};

const idx=<T extends string>(list:readonly T[],v:T)=>list.indexOf(v);
const pick=<T>(list:readonly T[],h:number):T|null=>list.length?list[h%list.length]!:null;
function patchPlot(i:number){const y=96+Math.floor(i/40)*8;return {x:(i%40)*8,y,width:8,depth:Math.min(8,180-y)};}
/** Manhattan distance from every pixel to the nearest pixel of `code` (57600 when there is none). */
function distanceTo(surface:Uint8Array,code:number):Int32Array {
 const d=new Int32Array(57600).fill(57600),queue=new Int32Array(57600);let head=0,tail=0;
 for(let i=0;i<57600;i++)if(surface[i]===code){d[i]=0;queue[tail++]=i;}
 while(head<tail){const i=queue[head++]!,x=i%320,y=Math.floor(i/320);
  for(const j of [x>0?i-1:-1,x<319?i+1:-1,y>0?i-320:-1,y<179?i+320:-1])if(j>=0&&d[j]!>d[i]!+1){d[j]=d[i]!+1;queue[tail++]=j;}}
 return d;
}

/** Local habitat of one patch from the saved physics, or null when the patch holds no land. */
export function patchHabitat(raster:{surface:Uint8Array;grade:Uint8Array;bearing:Uint8Array},fresh:Int32Array,sea:Int32Array,i:number):Habitat|null {
 const p=patchPlot(i),L=HABITAT_LIMITS;let land=0,cliff=0,sandbar=0,steep=0,wet=0,grade=0,f=57600,s=57600;
 for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){const j=y*320+x;if(raster.surface[j]!==1)continue;
  land++;grade+=raster.grade[j]!;if(raster.grade[j]===2)steep++;if(raster.bearing[j]===2)cliff++;if(raster.bearing[j]===1)sandbar++;
  if(fresh[j]!<=L.wetlandFresh)wet++;f=Math.min(f,fresh[j]!);s=Math.min(s,sea[j]!);}
 if(!land)return null;
 const meanGrade=grade/land;
 if(cliff/land>=L.rockyCliffShare||steep/land>=L.rockySteepShare||meanGrade>=L.rockyMeanGrade)return 'rocky';
 // Wetland: most of the patch lies at the water's edge, on flat ground (not every patch that touches the river).
 if(wet/land>=L.wetlandShare&&meanGrade<L.wetlandMeanGrade)return 'wetland';
 if(f<=L.riparianFresh)return 'riparian';
 if(s<=L.coastalSea||sandbar/land>=L.coastalSandbarShare)return 'coastal';
 return 'ordinary';
}

function communityOf(seed:number,site:RecordSite,i:number,habitat:Habitat,biome:BiomeKind):FloraPatch {
 const h=(salt:string)=>terrainHash([FLORA_RULE_ID,seed,site,i,salt]);
 const r=RECIPES[biome],noTrees=biome==='tundra';
 let canopy=pick(r.canopy,h('canopy')),shrub=pick(r.shrub,h('shrub')),herb=pick(r.herb,h('herb')),ground=r.ground;
 if(habitat==='riparian'){if(!noTrees&&h('riparian')%2===0)canopy='riparian';if(h('reed')%5<2)herb='wetland';if(biome!=='tundra')ground='wetSoil';}
 if(habitat==='wetland'){canopy=!noTrees&&h('riparian')%5===0?'riparian':null;herb='wetland';ground='wetSoil';}
 if(habitat==='rocky'){if(canopy&&!['conifer','savanna'].includes(canopy))canopy=biome==='boreal_forest'||biome==='temperate_forest'?'conifer':h('rock-tree')%2?canopy:null;herb='moss';ground='rock';}
 if(habitat==='coastal'){if(biome!=='tundra'&&biome!=='boreal_forest')ground='sand';if(herb!=='moss')herb='herb';}
 const potential=Math.max(0,Math.min(100,r.potential+HABITAT_POTENTIAL[habitat]+(canopy==='riparian'&&biome==='desert'?25:0)));
 // Stands: whole 40×24 px clusters share an age class, so old woods and young growth form patches, not noise.
 const cluster=terrainHash([FLORA_RULE_ID,seed,site,'stand',Math.floor(patchPlot(i).x/40),Math.floor((patchPlot(i).y-96)/24)]);
 const age=canopy===null?h('age')%30:cluster%3===0?80+h('age')%120:h('age')%60;
 return [idx(HABITATS,habitat),idx(BIOME_KINDS,biome),canopy===null?-1:idx(PLANT_ARCHETYPES,canopy),shrub===null?-1:idx(PLANT_ARCHETYPES,shrub),
  herb===null?-1:idx(PLANT_ARCHETYPES,herb),idx(GROUND_MATERIALS,ground),age,potential];
}

/** The world's local flora: deterministic from seed, climate and the initial terrain record. */
export function createLocalFlora(seed:number,climate:WorldClimateBaseline,terrain:GeneratedFacilityReview['terrain']):LocalFlora {
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error('Invalid world seed');
 if(climate.ruleId!=='initial-climate-v1')throw Error('Unknown climate rule');
 const t=climate.transition,share=t?TRANSITION_PATCH_SHARE[t.distance-1]??0:0;
 if(t&&(t.distance<1||t.distance>CLIMATE_TRANSITION_MARGIN))throw Error('Invalid climate transition');
 const sites={} as Record<RecordSite,(FloraPatch|null)[]>;
 for(const site of FLORA_SITES){
  const raster=readOwnedRecordPhysics(terrain.sites[site].physics);
  const fresh=distanceTo(raster.surface,2),sea=distanceTo(raster.surface,3);
  sites[site]=Array.from({length:440},(_,i)=>{
   const habitat=patchHabitat(raster,fresh,sea,i);if(!habitat)return null;
   const biome=t&&terrainHash([FLORA_RULE_ID,seed,site,i,'transition'])%100<share?t.biome:climate.dominantBiome;
   return Object.freeze(communityOf(seed,site,i,habitat,biome));
  });
  Object.freeze(sites[site]);
 }
 return Object.freeze({schemaVersion:1,ruleId:FLORA_RULE_ID,sites:Object.freeze(sites)});
}

/** Readable view of one saved patch. */
export function describeFloraPatch(p:FloraPatch){
 return {habitat:HABITATS[p[0]]!,biome:BIOME_KINDS[p[1]]!,canopy:p[2]<0?null:PLANT_ARCHETYPES[p[2]]!,shrub:p[3]<0?null:PLANT_ARCHETYPES[p[3]]!,
  herb:p[4]<0?null:PLANT_ARCHETYPES[p[4]]!,ground:GROUND_MATERIALS[p[5]]!,initialAge:p[6],potential:p[7]};
}
