/** Issue #37 D1a — deterministic, display-only ruin weathering / surface cover trial.
 * Not a game rule, not an observed building, not a saved environment or flora history.
 * D1b will decide how real released ground and flora patches constrain vine roots.
 */
import {Raster} from './pixel-raster.mjs';
import {drawArchitecture} from '../../dist/architecture/draw-v1.js';
import {drawRuin} from '../../dist/architecture/scene-v1.js';
import {normalizeSpec} from '../../dist/architecture/vocab-v1.js';

export const RULE_ID='issue37-d1a-controlled-prototype-v1';
export const YEARS=Object.freeze([0,50,200,500]);
export const RUIN_CONFIRMED_AT=100; // Controlled history event in a D1a fixture, NOT game logic.
export const WIDTH=320,HEIGHT=180;
export const MATERIALS=Object.freeze([
 {id:'timber',label:'木板・木造',weatherability:1,soil:'#857d6c',
  spec:{structure:'S02',wall:'plank',roofFamily:'R01',roofMaterial:'shingle',foundation:'F2',palette:'P01'}},
 {id:'earth',label:'土壁',weatherability:.82,soil:'#b19c7e',
  spec:{structure:'S03',wall:'earth',roofFamily:'R05',roofMaterial:'plaster',foundation:'F1',palette:'P02'}},
 {id:'stone',label:'石造',weatherability:.32,soil:'#999486',
  spec:{structure:'S05',wall:'ashlar',roofFamily:'R03',roofMaterial:'slate',foundation:'F2',palette:'P03'}},
 {id:'mixed',label:'木石混合',weatherability:.64,soil:'#928d7c',
  spec:{structure:'S06',wall:'mixed',roofFamily:'R08',roofMaterial:'tile',foundation:'F2',palette:'P05'}},
]);
export const BIOME_LABELS=Object.freeze({
 desert:'砂漠',steppe:'ステップ',grassland:'草原',temperate_forest:'温帯林',
 tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ',
});
const COLORS=Object.freeze({
 desert:{sky:'#d3c8aa',far:'#c8af8c',land:'#b69a73',bush:'#8d825e'},
 steppe:{sky:'#c4c6b2',far:'#a9ab91',land:'#a89e70',bush:'#777c5f'},
 grassland:{sky:'#b6c8b8',far:'#99ac92',land:'#8c9c6c',bush:'#6c8056'},
 temperate_forest:{sky:'#b5c5b9',far:'#8ba190',land:'#748c66',bush:'#546f50'},
 tropical_rainforest:{sky:'#a7c3b6',far:'#83a499',land:'#64856a',bush:'#426c52'},
 boreal_forest:{sky:'#bdc9c8',far:'#9baea7',land:'#7e927b',bush:'#526a5e'},
 tundra:{sky:'#c4ccd0',far:'#a9b9b9',land:'#9aa39b',bush:'#6e817e'},
});
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const lerp=(a,b,t)=>Math.round(a+(b-a)*t);
const rgb=(c)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const hex=(v)=>'#'+v.map(n=>Math.round(clamp(n,0,255)).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>hex(rgb(a).map((c,i)=>lerp(c,rgb(b)[i],clamp(t))));
const colorAt=(data,index)=>hex([...data.subarray(index,index+3)]);
/** Visual namespace, independent of civilization RNG, seed and camera redraw count. */
export function trialHash(...parts){
 let h=2166136261>>>0;
 for(const part of parts)for(const ch of String(part)+'|'){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h^h>>>16)>>>0;
}
export function trialSpec(materialId){
 const material=MATERIALS.find(x=>x.id===materialId);
 if(!material)throw Error('Unknown D1a material '+materialId);
 return normalizeSpec({use:'hall',pitch:'mid',eaves:'normal',window:'W2',entrance:'E1',
  ornaments:[],storeys:1,...material.spec});
}
export function trialEnvironment(climate){
 if(!climate||!Object.hasOwn(BIOME_LABELS,climate.dominantBiome)||
   !Number.isFinite(climate.effectiveMoisture)||!Number.isFinite(climate.effectiveTemperature))throw Error('Unknown D1a climate');
 const moisture=clamp((climate.effectiveMoisture+75)/145),
  temperature=clamp((climate.effectiveTemperature+60)/110);
 const mossSuitability=clamp((moisture-.15)/.75)*clamp((temperature+.03)/.40);
 const vineSuitability=clamp((moisture-.32)/.55)*clamp((temperature-.14)/.48);
 return Object.freeze({moisture,temperature,mossSuitability,vineSuitability});
}
/** A controlled fixture: abandoned at t=0, already-confirmed ruin at t=100. */
export function trialAppearance(materialId,climate,years){
 const material=MATERIALS.find(x=>x.id===materialId);
 if(!material||!YEARS.includes(years))throw Error('Unknown D1a controlled input');
 const env=trialEnvironment(climate),growth=1-Math.exp(-years/145);
 const materialWeather=material.weatherability;
 const weathering=clamp(growth*(.28+materialWeather*.68)*(1+env.moisture*.22));
 const moss=clamp(env.mossSuitability*growth*(materialId==='stone'?1.15:materialId==='earth'?.72:.9));
 const vines=clamp(env.vineSuitability*growth*(materialId==='stone'?.95:1));
 const ruined=years>=RUIN_CONFIRMED_AT;
 const loss=ruined?clamp(((years-RUIN_CONFIRMED_AT)/390)*materialWeather*.35):clamp((years/500)*materialWeather*.15);
 return Object.freeze({ruleId:RULE_ID,years,state:ruined?'ruined':'vacant',
  confirmedEvents:[{year:0,kind:'vacated'},{year:RUIN_CONFIRMED_AT,kind:'ruined'}].filter(e=>e.year<=years),
  weathering,moss,vines,loss,...env});
}
const pos=(x,y)=>(y*WIDTH+x)*4;
const opaque=(image,x,y)=>x>=0&&x<WIDTH&&y>=0&&y<HEIGHT&&image.data[pos(x,y)+3]!==0;
/** 320x180 independent comparison stage: illustrative horizon/soil only, NOT the game terrain. */
export function trialBackdrop(biome){
 const c=COLORS[biome];if(!c)throw Error('Unknown D1a biome');
 const r=new Raster(WIDTH,HEIGHT);
 for(let y=0;y<110;y++){const t=Math.floor(y/12)/10;r.rect(0,y,WIDTH,1,mix(c.sky,'#dcd5ba',t*.46));}
 for(let x=0;x<WIDTH;x++){
  const ridge=90-((Math.floor(x/39)*7+Math.floor(x/13))%13);
  r.rect(x,ridge,1,105-ridge,c.far);
 }
 r.rect(0,105,WIDTH,HEIGHT-105,c.land);
 // Fixed site marks. They provide scale but make no claim about a real saved flora patch.
 for(let y=118;y<HEIGHT;y+=7)for(let x=3;x<WIDTH;x+=9){
  const h=trialHash(biome,'soil',x,y);
  if(h%5===0)r.rect(x,y,1,1,mix(c.land,'#dfc7a0',.24));
 }
 for(const x of [13,37,59,245,273,300]){
  const h=trialHash(biome,'side',x)%6;
  const y=133+h,g=biome==='desert'||biome==='tundra'?3:6;
  r.rect(x,y-g,1,g,c.bush);r.rect(x-2,y-g+2,5,2,c.bush);
  if(['temperate_forest','tropical_rainforest','boreal_forest'].includes(biome)){
   r.rect(x-3,y-g-4,7,3,c.bush);
  }
 }
 // Standing scale reference; not a simulation inhabitant.
 r.rect(92,138,2,2,'#d4bd96');r.rect(92,140,2,4,'#6b6758');r.rect(92,144,1,3,'#494c47');
 return r;
}
function buildingOf(spec,appearance){
 const b=new Raster(WIDTH,HEIGHT),draw=g=>drawArchitecture(g,spec,160,145,{width:72,height:27});
 if(appearance.state==='ruined')drawRuin(b,'issue37-d1a-same-building',draw);
 else draw(b);
 return b;
}
function modifyColor(r,k,color){const v=rgb(color);r.data[k]=v[0];r.data[k+1]=v[1];r.data[k+2]=v[2];}
function ageBuilding(building,material,biome,app){
 let worn=0,missing=0,mossPixels=0,vinePixels=0;
 const x0=108,x1=212,limitY=155;
 // Only *existing* silhouette pixels can receive any cover; no free-standing fictional wall/roof.
 for(let y=60;y<limitY;y++)for(let x=x0;x<x1;x++){
  if(!opaque(building,x,y))continue;
  const k=pos(x,y),v=trialHash('weather',material.id,x,y),wearNoise=v%10000/10000;
  const doChip=app.years>0&&y<144&&wearNoise<app.loss*(y<129?1.08:.50);
  // Ruins may be almost hidden, but never convert this visual erosion to a building deletion.
  if(doChip&&!(y>=142&&x%7===0)){
   building.data[k+3]=0;missing++;continue;
  }
  const original=colorAt(building.data,k);
  const shade=(wearNoise-.5)*.13+(app.weathering*.52);
  modifyColor(building,k,mix(original,material.soil,clamp(shade)));
  if(app.weathering>0)worn++;
  // Surface moss clusters, humidity-dependent, with no new plant entity or history.
  const cluster=trialHash('moss-cluster',biome,Math.floor(x/4),Math.floor(y/3))%1000/1000;
  const detail=trialHash('moss-fleck',material.id,x,y)%1000/1000;
  const lower=clamp((y-85)/65,.12,1);
  const mossHere=cluster<app.moss*(.52+.6*lower)&&detail<.55;
  if(mossHere){
   modifyColor(building,k,mix(colorAt(building.data,k),'#55745b',.52+.23*app.moss));
   mossPixels++;
  }
 }
 // Controlled visual root proxy only, not a persisted/confirmed vegetation root.
 // The actual rooted vine / local habitat eligibility is D1b's responsibility.
 if(app.vines>.05){
  const extent=Math.max(0,Math.round(app.vines*32));
  const roots=[128,199];
  for(let ri=0;ri<roots.length;ri++){
   const root=roots[ri];
   for(let dy=0;dy<extent;dy++){
    const y=141-dy,x=root+(ri===0?1:-1)*Math.floor(dy/9)+(trialHash('vine',ri,Math.floor(dy/5))%3-1);
    if(!opaque(building,x,y))continue;
    if(trialHash('vine-leaf',material.id,x,y)%100<24&&dy>6)continue;
    const k=pos(x,y);
    modifyColor(building,k,mix(colorAt(building.data,k),ri?'#477150':'#53774b',.76));
    vinePixels++;
    if(dy%5===0&&opaque(building,x+1,y)&&trialHash('vine-side',dy)%3===0){
     modifyColor(building,pos(x+1,y),'#67835e');vinePixels++;
    }
   }
  }
 }
 return {building,metrics:{worn,missing,mossPixels,vinePixels,visiblePixels:building.data.reduce((s,v,i)=>s+(i%4===3&&v!==0?1:0),0)}};
}
export function renderD1a({materialId,climate,years}){
 const material=MATERIALS.find(m=>m.id===materialId);
 if(!material||!YEARS.includes(years))throw Error('Unknown D1a render input');
 const app=trialAppearance(materialId,climate,years);
 const building=buildingOf(trialSpec(materialId),app);
 const {metrics}=ageBuilding(building,material,climate.dominantBiome,app);
 const landscape=trialBackdrop(climate.dominantBiome);
 landscape.blit(building,0,0);
 return {raster:landscape,building,appearance:app,metrics,spec:trialSpec(materialId)};
}
