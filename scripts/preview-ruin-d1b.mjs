/**
 * Issue #37 D1b: where plants take root again on abandoned ground — the local access projection (reclamation-access-v1)
 * against the alternative of releasing whole 8×8 vegetation patches, on a synthetic 320×180 stage (PROTOTYPE).
 * Development timelines only: nothing is read from or written to a world, a save or a history (D0 §10, §11).
 *
 *   npm run build && node scripts/preview-ruin-d1b.mjs  →  artifacts/ruin37-d1b/{gallery.html,report.json,*.png}
 *
 * Rows per biome: live (today: a ruined plot stays bare), A (patch release), B (local access, D0 §5 recommendation),
 * and the masks of B. The stage is flat land with a river on the right; houses use the D1a weathering.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Raster} from './lib/pixel-raster.mjs';
import {drawArchitecture} from '../dist/architecture/draw-v1.js';
import {drawMiniature} from '../dist/architecture/miniature-v1.js';
import {normalizeSpec} from '../dist/architecture/vocab-v1.js';
import {projectHousingBlock} from '../dist/scene/composition.js';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {PLANT_ARCHETYPES,GROUND_MATERIALS} from '../dist/flora/local-flora-v1.js';
import {stageOfAge,ceilingStage} from '../dist/flora/flora-growth-v1.js';
import {planFloraScene,rasterizeFlora,composeFlora,BIOME_SCENE} from '../dist/flora/flora-scene-v1.js';
import {terrainHash} from '../dist/terrain/terrain-hash-v1.js';
import {ruinClimateOf,ruinAppearanceOf,ruinLookOf,drawWeatheredArchitecture} from '../dist/ruin/ruin-weathering-v1.js';
import {reclamationPeriods,openZonesAt,reclamationMask,planReclamation,facilityWallPlans,housingPartPlans,RECLAMATION_PARAMETERS,HOUSE_PLAN_DEPTH,RECLAMATION_RULE_ID} from '../dist/ruin/reclamation-access-v1.js';

const out='artifacts/ruin37-d1b',SITE='river-bank',SKY='#c9cdb8',RIVER='#6f8f9a';
await mkdir(out,{recursive:true});
const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
const BIOMES=['temperate_forest','grassland','tropical_rainforest'];
const YEARS=[100,130,170,300,330,350,420,600];

// ---- the stage: flat land, a river on the right (record coordinates) ----
const physics={surface:new Uint8Array(57600),grade:new Uint8Array(57600),bearing:new Uint8Array(57600)};
const river=(x,y)=>x>=288+Math.round(3*Math.sin(y/9))&&x<300+Math.round(3*Math.sin(y/9));
for(let y=96;y<180;y++)for(let x=0;x<320;x++)physics.surface[y*320+x]=river(x,y)?2:1;

/** Patch communities like local-flora-v1 (same recipes for the three biomes, ordinary habitat, stands in 40×24 clusters). */
const RECIPES={temperate_forest:{canopy:['deciduous','evergreen','conifer'],shrub:['shrub'],herb:['understory','herb'],ground:'leafLitter',potential:85},
 grassland:{canopy:['savanna','deciduous'],shrub:['shrub'],herb:['herb'],ground:'bareSoil',potential:35},
 tropical_rainforest:{canopy:['tropical','evergreen'],shrub:['shrub'],herb:['understory','wetland'],ground:'wetSoil',potential:90}};
const patchesOf=(biome,seed)=>Array.from({length:440},(_,i)=>{
 const px=(i%40)*8,py=96+Math.floor(i/40)*8;let land=false;for(let y=py;y<Math.min(180,py+8);y++)for(let x=px;x<px+8;x++)land||=physics.surface[y*320+x]===1;
 if(!land)return null;
 const r=RECIPES[biome],h=s=>terrainHash(['d1b-stage',seed,i,s]),pick=l=>l[h(l.join())%l.length];
 const cluster=terrainHash(['d1b-stand',seed,Math.floor(px/40),Math.floor((py-96)/24)]);
 return Object.freeze([0,BIOME_KINDS.indexOf(biome),PLANT_ARCHETYPES.indexOf(pick(r.canopy)),PLANT_ARCHETYPES.indexOf(pick(r.shrub)),PLANT_ARCHETYPES.indexOf(pick(r.herb)),GROUND_MATERIALS.indexOf(r.ground),cluster%3===0?80+h('age')%120:h('age')%60,r.potential]);
});

// ---- owners and their development timelines ----
const H=(year,use,condition,why)=>({year,use,condition,sourceKey:`dev:${why}:${year}`});
const F=(year,condition,why)=>({year,condition,sourceKey:`dev:${why}:${year}`});
const OWNERS=[
 {kind:'housing',id:'block-A',footprint:{x:30,y:140,width:72,depth:22},count:12,spec:{structure:'S01',wall:'wattle',roofMaterial:'thatch',eaves:'deep',entrance:'E3',foundation:'F2'},
  changes:[H(0,'occupied','sound','built'),H(90,'underused','sound','underused'),H(110,'vacant','sound','vacated'),H(140,'vacant','ruined','ruined'),H(320,'vacant','sound','repaired'),H(335,'occupied','sound','reused'),H(380,'underused','sound','underused'),H(400,'vacant','sound','vacated')],
  note:'空き家110年・廃墟140年・修繕(空き家)320年・再利用335年・再び空き家400年'},
 {kind:'housing',id:'block-D',footprint:{x:104,y:140,width:24,depth:22},count:4,spec:{structure:'S06',roofFamily:'R08',roofMaterial:'shingle',window:'W4',entrance:'E4'},
  changes:[H(0,'occupied','sound','built')],note:'ずっと使用中（街区Aと2px隔てて隣接）'},
 {kind:'housing',id:'block-B',footprint:{x:122,y:112,width:54,depth:16},count:6,spec:{structure:'S02',wall:'plank',roofMaterial:'shingle'},
  changes:[H(0,'occupied','sound','built'),H(60,'underused','sound','underused'),H(80,'vacant','sound','vacated'),H(100,'vacant','ruined','ruined')],note:'空き家80年・廃墟100年（パッチ境界をまたぐ）'},
 {kind:'facility',id:'workshop-F',x:200,y:150,footprint:{x:191,y:146,width:18,depth:7},spec:{use:'workshop',structure:'S05',roofFamily:'R03',roofMaterial:'tile',window:'W2'},
  changes:[F(0,'intact','built'),F(120,'ruined','abandoned'),F(420,'intact','reused')],note:'放棄120年・再利用420年'},
 {kind:'housing',id:'block-C',footprint:{x:262,y:150,width:22,depth:14},count:2,spec:{structure:'S03',roofFamily:'R05',roofMaterial:'plaster'},
  changes:[H(0,'occupied','sound','built'),H(70,'underused','sound','underused'),H(100,'vacant','sound','vacated'),H(130,'vacant','ruined','ruined')],note:'空き家100年・廃墟130年（川に接する）'},
];
const stateAt=(o,year)=>{let s=null;for(const c of o.changes)if(c.year<=year)s=c;return s;};
const blockOf=(o,year)=>{const s=stateAt(o,year);return projectHousingBlock({blockId:o.id,siteId:SITE,footprint:o.footprint,builtYear:0,housingCount:o.count,condition:s.condition,use:s.use,styleId:'low',styleSeed:7},true);};
for(const o of OWNERS)o.protectedPlans=o.kind==='facility'?facilityWallPlans(o.footprint):housingPartPlans(blockOf(o,0).roofParts);
/** D1a clocks from the timeline: vacant since entering vacancy (a repair restarts the weathering), ruin since the ruin. */
const clocksOf=(o,year)=>{
 const isOpen=c=>o.kind==='housing'?c.use==='vacant':c.condition==='ruined';
 let prev=null,since=null,ruinSince=null;
 for(const c of o.changes){if(c.year>year)break;
  if(isOpen(c)&&(!prev||!isOpen(prev)))since=c.year;
  if(isOpen(c)&&prev&&prev.condition==='ruined'&&c.condition!=='ruined')since=c.year;
  if(!isOpen(c))since=null;
  if(c.condition==='ruined'&&prev?.condition!=='ruined')ruinSince=c.year;if(c.condition!=='ruined')ruinSince=null;
  prev=c;}
 return since===null?{abandonedYears:null,ruinedYears:null}:{abandonedYears:year-since,ruinedYears:ruinSince===null?null:year-ruinSince};
};
/** Footprints standing (not open to plants) in a year, for the live scene: every building plot, ruined or not. */
const liveOccupied=()=>OWNERS.map(o=>o.footprint);

const files=[],audit=[];
const save=async(name,r)=>{const png=r.png();await writeFile(`${out}/${name}.png`,png);files.push({name,sha256:createHash('sha256').update(png).digest('hex')});};

for(const biome of BIOMES){
 let seed=1;for(;seed<20000;seed++){const c=generateClimateBaseline(seed);if(c.dominantBiome===biome&&!c.transition)break;}
 const climate=generateClimateBaseline(seed),rc=ruinClimateOf(climate),patches=patchesOf(biome,seed),soil=BIOME_SCENE[biome].soil,look=ruinLookOf(rc,soil);
 const ceil=patches.map((p,i)=>p&&ceilingStage(p,climate,{humidity:0,temperature:0},terrainHash(['d1b-jitter',seed,i])%7));
 const overlaps=(i,f)=>{const x=(i%40)*8,y=96+Math.floor(i/40)*8;return x<f.x+f.width&&x+8>f.x&&y<f.y+f.depth&&y+8>f.y;};
 /** Patch views (vegetationAt + flora-growth-v1): built plots were cleared in year 0; `release` adds the A clearings. */
 const viewsAt=(year,release)=>patches.map((p,i)=>{if(!p)return null;let from=null;for(const o of OWNERS)if(overlaps(i,o.footprint))from=0;
  for(const r of release)if(r.year<=year&&overlaps(i,r.plot))from=Math.max(from??0,r.year);
  const age=from===null?p[6]+year:year-from;return {index:i,stage:Math.min(stageOfAge(age),ceil[i]),ceiling:ceil[i],age,disturbedYear:from};});
 // A: one `release` per opening of a perimeter (housing vacated / facility abandoned) on the plot, as the existing fields and plazas do
 const releases=OWNERS.flatMap(o=>reclamationPeriods(o).filter(p=>p.zone==='perimeter').map(p=>({year:p.openedYear,closed:p.closedYear,plot:o.footprint,owner:o.id})));
 for(const year of YEARS){
  const standingB=o=>OWNERS.filter(x=>x!==o&&openZonesAt(reclamationPeriods(x),year).length===0).map(x=>x.footprint);
  const live=planFloraScene({seed,site:SITE,patches,views:viewsAt(year,[]),physics,occupied:liveOccupied()});
  const openA=releases.filter(r=>r.year<=year&&(r.closed===null||year<r.closed));
  const A=planFloraScene({seed,site:SITE,patches,views:viewsAt(year,releases.filter(r=>r.year<=year)),physics,occupied:OWNERS.filter(o=>!openA.some(r=>r.owner===o.id)).map(o=>o.footprint)});
  const local=[],masks=[],zones={perimeter:0,'exposed-interior':0};
  for(const o of OWNERS){const mask=reclamationMask(o,physics,standingB(o));masks.push({o,mask});
   const r=planReclamation({seed,site:SITE,owner:o,year,mask,patches,views:viewsAt(year,[]),existing:[...live,...local],standing:standingB(o)});local.push(...r.plants);for(const x of r.roots)zones[x.zone]++;}
  const B=[...live,...local];
  // audit: trees outside every footprint lost against live (A resets patch ages), roots on a structure plan or another plot
  const outside=p=>!OWNERS.some(o=>p.x>=o.footprint.x&&p.x<o.footprint.x+o.footprint.width&&p.y>=o.footprint.y&&p.y<o.footprint.y+o.footprint.depth);
  const key=p=>p.x+','+p.y+','+p.id;
  // outdoor trees whose patch A sets back (the patch's stage falls below the live one): the rollback D0 §5 warns about
  const vLive=viewsAt(year,[]),vA=viewsAt(year,releases.filter(r=>r.year<=year)),pi=p=>Math.floor((p.y-96)/8)*40+Math.floor(p.x/8);
  const rolledBack=live.filter(p=>p.kind==='tree'&&outside(p)&&vA[pi(p)].stage<vLive[pi(p)].stage).length;
  const lost=list=>live.filter(p=>p.kind==='tree'&&outside(p)&&!list.some(q=>key(q)===key(p))).length;
  const onPlan=list=>list.filter(p=>OWNERS.some(o=>o.protectedPlans.some(q=>[[0,0],[1,0],[0,1],[1,1]].some(([dx,dy])=>p.x+dx>=q.x&&p.x+dx<q.x+q.width&&p.y+dy>=q.y&&p.y+dy<q.y+q.depth)))).length;
  const inUse=list=>list.filter(p=>OWNERS.some(o=>openZonesAt(reclamationPeriods(o),year).length===0&&p.x>=o.footprint.x&&p.x<o.footprint.x+o.footprint.width&&p.y>=o.footprint.y&&p.y<o.footprint.y+o.footprint.depth)).length;
  audit.push({biome,year,live:{plants:live.length},A:{plants:A.length,outdoorTreesRolledBack:rolledBack,outdoorTreesLost:lost(A),rootsOnStructures:onPlan(A),rootsInBuildingsInUse:inUse(A)},
   B:{plants:B.length,local:local.length,localByZone:zones,outdoorTreesLost:lost(B),rootsOnStructures:onPlan(B),rootsInBuildingsInUse:inUse(B)}});
  for(const [row,plants] of [['live',live],['A',A],['B',B]])await save(`${biome}_${row}_${year}`,scene(year,plants,look,soil,rc));
  await save(`${biome}_mask_${year}`,maskView(year,masks,soil));
 }
 console.log(biome,seed,JSON.stringify(audit.filter(a=>a.biome===biome).map(a=>[a.year,a.A.outdoorTreesLost,a.A.rootsOnStructures,a.B.local])));
}

function scene(year,plants,look,soil,rc){
 const r=new Raster(320,180);r.rect(0,0,320,96,SKY);r.rect(0,96,320,84,soil);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)if(physics.surface[y*320+x]===2)r.rect(x,y,1,1,RIVER);
 // structures one by one (parts far→near by y, then facilities); each pixel keeps its owner's ground line
 const line=new Int16Array(57600).fill(-1),layer=new Raster(320,180);
 const draw=(lineY,paint)=>{const t=new Raster(320,180);paint(t);for(let i=0;i<57600;i++)if(t.data[i*4+3]){line[i]=lineY;layer.data.set(t.data.subarray(i*4,i*4+4),i*4);}};
 const parts=OWNERS.filter(o=>o.kind==='housing').flatMap(o=>blockOf(o,year).roofParts.map(p=>({o,p}))).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
 for(const {o,p} of parts){const spec=normalizeSpec({use:'house',...o.spec}),ap=ruinAppearanceOf(spec,clocksOf(o,year),rc);
  draw(p.y,t=>drawWeatheredArchitecture(t,p.partId,g=>drawMiniature(g,spec,p.x,p.y,p.depth),ap,look));}
 for(const o of OWNERS.filter(o=>o.kind==='facility')){const spec=normalizeSpec(o.spec),ap=ruinAppearanceOf(spec,clocksOf(o,year),rc);
  draw(o.footprint.y+o.footprint.depth,t=>drawWeatheredArchitecture(t,o.id,g=>drawArchitecture(g,spec,o.x,o.y),ap,look));}
 const flora=composeFlora(rasterizeFlora(plants,false));
 const put=(i,src,o)=>{if(src[o+3])r.data.set(src.subarray(o,o+4),i*4);};
 for(let i=0;i<57600;i++){const root=flora.root[i];if(root>=0&&!(layer.data[i*4+3]&&root>line[i]))put(i,flora.rgba,i*4);}
 for(let i=0;i<57600;i++)if(layer.data[i*4+3])put(i,layer.data,i*4);
 for(let i=0;i<57600;i++){const root=flora.root[i];if(root>=0&&layer.data[i*4+3]&&root>line[i])put(i,flora.rgba,i*4);}
 return r;
}
function maskView(year,masks,soil){
 const r=new Raster(320,180);r.rect(0,0,320,96,SKY);r.rect(0,96,320,84,'#d9dccd');
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){if(physics.surface[y*320+x]===2)r.rect(x,y,1,1,'#a9c0c8');if(x%8===0||(y-96)%8===0)r.rect(x,y,1,1,'#c2c6b6');}
 for(const o of OWNERS){const f=o.footprint;for(let x=f.x;x<f.x+f.width;x++){r.rect(x,f.y,1,1,'#6b6f66');r.rect(x,f.y+f.depth-1,1,1,'#6b6f66');}for(let y=f.y;y<f.y+f.depth;y++){r.rect(f.x,y,1,1,'#6b6f66');r.rect(f.x+f.width-1,y,1,1,'#6b6f66');}}
 for(const {o,mask} of masks){const open=new Set(openZonesAt(reclamationPeriods(o),year).map(p=>p.zone));
  for(let i=0;i<57600;i++){if(!mask[i])continue;const zone=mask[i]===1?'perimeter':'exposed-interior',x=i%320,y=Math.floor(i/320);
   r.rect(x,y,1,1,zone==='perimeter'?(open.has(zone)?'#d08a3c':'#ecd4b4'):(open.has(zone)?'#3c8fa8':'#b8d6de'));}}
 for(const o of OWNERS)for(const q of o.protectedPlans)r.rect(q.x,q.y,q.width,q.depth,'#a8423a');
 return r;
}

const report={issue:37,stage:'D1b',ruleId:RECLAMATION_RULE_ID,status:'PROTOTYPE — synthetic stage and development timelines; not a world, save or history',
 parameters:RECLAMATION_PARAMETERS,housePlanDepth:HOUSE_PLAN_DEPTH,years:YEARS,owners:OWNERS.map(o=>({id:o.id,kind:o.kind,footprint:o.footprint,note:o.note,changes:o.changes,periods:reclamationPeriods(o)})),audit,files};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ROW={live:'本編（今）',A:'A：パッチ全体をrelease',B:'B：局所アクセス（推奨）',mask:'Bのマスク'};
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 37 D1b 自然回帰</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}img{display:block;image-rendering:pixelated}.scroll{overflow-x:auto}table{border-spacing:6px}th{font-size:12px;text-align:left;white-space:nowrap}small{color:#5d6a5f}</style>
<main><h1>Issue #37 D1b｜廃墟の敷地への植物の回帰</h1><p>PROTOTYPE。合成した舞台と開発用の年表。${OWNERS.map(o=>`<br>${esc(o.id)}：${esc(o.note)}`).join('')}</p>
${BIOMES.map(b=>`<h2>${LABEL[b]}</h2><div class="scroll"><table><tr><th></th>${YEARS.map(y=>`<th>${y}年</th>`).join('')}</tr>${['live','A','B','mask'].map(row=>`<tr><th>${ROW[row]}</th>${YEARS.map(y=>`<td><img src="${b}_${row}_${y}.png" width="640" height="360" loading="lazy" alt=""></td>`).join('')}</tr>`).join('')}</table></div>`).join('')}
<h2>監査</h2><pre>${esc(JSON.stringify(audit,null,1))}</pre></main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue37-d1b',images:files.length,out}));
