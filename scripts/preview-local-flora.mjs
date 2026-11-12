/**
 * Issue #47 B2b review: local habitat and initial plant community maps on real worlds. Review aid only.
 *   npm run build && node scripts/preview-local-flora.mjs  →  artifacts/biome47-b2b/
 * Draws the saved terrain of each site (land / freshwater / sea, mirrored like the game screen) with each
 * 8×8 patch coloured by habitat, and by its tree form. Statistics over 30 worlds go to report.json.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {Raster} from './lib/pixel-raster.mjs';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {FLORA_SITES,HABITATS,PLANT_ARCHETYPES,HABITAT_LIMITS,TRANSITION_PATCH_SHARE,describeFloraPatch} from '../dist/flora/local-flora-v1.js';

const out='artifacts/biome47-b2b';await mkdir(out,{recursive:true});
const HABITAT_COLOR={ordinary:'#b9b88a',riparian:'#5f9a5a',wetland:'#3f7f86',coastal:'#d6c48a',rocky:'#8f8a80'};
const TREE_COLOR={deciduous:'#7aa35a',evergreen:'#3f6a45',conifer:'#2f5a4a',tropical:'#2e7a3a',savanna:'#a8a050',riparian:'#8fbf6a'};
const WATER={2:'#6a9cb0',3:'#4f7f99'},SKY='#e4e6dc';
const findSeed=f=>{for(let s=1;s<20000;s++)if(f(generateClimateBaseline(s)))return s;return null;};
const picks=[
 ['desert',findSeed(c=>c.dominantBiome==='desert'&&!c.transition)],['steppe',findSeed(c=>c.dominantBiome==='steppe'&&!c.transition)],
 ['grassland',findSeed(c=>c.dominantBiome==='grassland'&&!c.transition)],['temperate_forest',findSeed(c=>c.dominantBiome==='temperate_forest'&&!c.transition)],
 ['tropical_rainforest',findSeed(c=>c.dominantBiome==='tropical_rainforest'&&!c.transition)],['boreal_forest',findSeed(c=>c.dominantBiome==='boreal_forest'&&!c.transition)],
 ['tundra',findSeed(c=>c.dominantBiome==='tundra'&&!c.transition)],['transition',findSeed(c=>c.transition?.distance===1)],
];
function map(world,site,colourOf){
 const t=world.architecture.terrain.review.terrain,r=readOwnedRecordPhysics(t.sites[site].physics),mirror=t.sites[site].render.mirrorX===true;
 const img=new Raster(320,180);img.rect(0,0,320,96,SKY);
 const patches=world.flora.sites[site];
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const j=y*320+x,i=Math.floor((y-96)/8)*40+Math.floor(x/8),p=patches[i];
  const c=r.surface[j]!==1?WATER[r.surface[j]]:p?colourOf(describeFloraPatch(p)):'#000000';
  img.rect(mirror?319-x:x,y,1,1,c);
 }
 // patch grid, faint, so the 8×8 unit is visible
 for(let y=96;y<180;y+=8)for(let x=0;x<320;x+=2)img.rect(x,y,1,1,'#ffffff');
 return img;
}
const files=[],cases=[];
for(const [label,seed] of picks){
 if(!seed)continue;
 const world=await createNewArchitectureWorld(seed),c=generateClimateBaseline(seed),entry={label,seed,biome:c.dominantBiome,transition:c.transition,sites:{}};
 for(const site of FLORA_SITES){
  const counts=Object.fromEntries(HABITATS.map(h=>[h,0])),trees={};
  for(const p of world.flora.sites[site]){if(!p)continue;const d=describeFloraPatch(p);counts[d.habitat]++;trees[d.canopy??'none']=(trees[d.canopy??'none']??0)+1;}
  const habitat=map(world,site,d=>HABITAT_COLOR[d.habitat]),tree=map(world,site,d=>d.canopy?TREE_COLOR[d.canopy]??'#555555':'#d9d4c0');
  for(const [kind,img] of [['habitat',habitat],['trees',tree]]){const name=`${label}_${site}_${kind}`;await writeFile(`${out}/${name}.png`,img.scale(2).png());files.push(name);}
  entry.sites[site]={habitats:counts,trees};
 }
 cases.push(entry);
}
// Habitat statistics over 30 worlds (seeds 1..30): share of land patches per habitat and site.
const stats=Object.fromEntries(FLORA_SITES.map(s=>[s,Object.fromEntries(HABITATS.map(h=>[h,0]))])),totals=Object.fromEntries(FLORA_SITES.map(s=>[s,0]));
for(let seed=1;seed<=30;seed++){const w=await createNewArchitectureWorld(seed);for(const site of FLORA_SITES)for(const p of w.flora.sites[site]){if(!p)continue;totals[site]++;stats[site][describeFloraPatch(p).habitat]++;}}
const shares=Object.fromEntries(FLORA_SITES.map(s=>[s,Object.fromEntries(HABITATS.map(h=>[h,Math.round(stats[s][h]/totals[s]*1000)/10]))]));
await writeFile(out+'/report.json',JSON.stringify({status:'REVIEW_AID',issue:47,stage:'B2b',limits:HABITAT_LIMITS,transitionPatchShare:TRANSITION_PATCH_SHARE,
 habitatColours:HABITAT_COLOR,treeColours:TREE_COLOR,cases,habitatSharesOver30Worlds:shares,files},null,1)+'\n');
console.log(JSON.stringify({type:'biome47-b2b',cases:cases.map(c=>c.label+':'+c.seed),habitatSharesOver30Worlds:shares},null,1));
