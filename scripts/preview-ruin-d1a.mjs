/**
 * Issue #37 D1a: weathering, moss, vines and sand on abandoned buildings — an independent drawing (PROTOTYPE).
 * Development clocks only: nothing here is read from or written to a world, a save or a history (D0 §10, §11).
 *
 *   npm run build && node scripts/preview-ruin-d1a.mjs  →  artifacts/ruin37-d1a/{gallery.html,report.json,*.png}
 *
 *  1. ages_<biome>:     7 wall/roof materials × 7 times (in use … 500 years) in one climate
 *  2. biomes_<years>:   7 biomes × 7 materials at 30 / 50 / 200 / 500 years after abandonment
 *  3. stage_<biome>_<years>: 320×180 stage of abandoned houses, workshops and a hall next to one building in use
 * The timeline is a development scenario: vacated at year 0, a ruin from year 30 (RUIN_AT).
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Raster} from './lib/pixel-raster.mjs';
import {drawArchitecture} from '../dist/architecture/draw-v1.js';
import {drawMiniature} from '../dist/architecture/miniature-v1.js';
import {drawRuin} from '../dist/architecture/scene-v1.js';
import {normalizeSpec} from '../dist/architecture/vocab-v1.js';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {ruinClimateOf,ruinAppearanceOf,ruinLookOf,drawWeatheredArchitecture,RUIN_PARAMETERS,RUIN_WEATHERING_RULE_ID} from '../dist/ruin/ruin-weathering-v1.js';

const out='artifacts/ruin37-d1a',RUIN_AT=30,SKY='#c9cdb8';
await mkdir(out,{recursive:true});
const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
/** Flat stage ground per biome (stand-in for the terrain; D1a draws no plants or ground cover). */
const GROUND={desert:'#cdbb8a',steppe:'#a99c72',grassland:'#9a9a62',temperate_forest:'#7d8456',tropical_rainforest:'#5f7448',boreal_forest:'#727a5c',tundra:'#a7aa9c'};
const firstSeed=b=>{for(let s=1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}throw Error('no seed');};
const worlds=BIOME_KINDS.map(biome=>{const seed=firstSeed(biome),c=generateClimateBaseline(seed),climate=ruinClimateOf(c);return {biome,seed,baseline:c,climate,look:ruinLookOf(climate,GROUND[biome])};});

/** Seven materials (normal-form house specs, the D1 cultures where one fits). */
const MATERIALS=[
 {id:'log',label:'丸太＋木板屋根',spec:{structure:'S02',wall:'log',roofMaterial:'shingle'}},
 {id:'plank',label:'木板（柱梁）＋木板屋根',spec:{structure:'S01',wall:'plank',roofMaterial:'shingle',pitch:'high'}},
 {id:'wattle',label:'編み枝土壁＋茅（C1）',spec:{structure:'S01',wall:'wattle',roofMaterial:'thatch',eaves:'deep',entrance:'E3',foundation:'F2',ornaments:['O2','O3']}},
 {id:'earth',label:'厚い土壁＋土屋根（C2）',spec:{structure:'S03',roofFamily:'R05',roofMaterial:'plaster',ornaments:['O5'],palette:'P02'}},
 {id:'rubble',label:'不揃い石＋石板（C3）',spec:{structure:'S04',roofFamily:'R06',roofMaterial:'slate',window:'W2',entrance:'E5',foundation:'F4',palette:'P03'}},
 {id:'ashlar',label:'整形石＋瓦',spec:{structure:'S05',roofFamily:'R03',roofMaterial:'tile',window:'W2',palette:'P03'}},
 {id:'mixed',label:'木石混合＋木板（C6）',spec:{structure:'S06',roofFamily:'R08',roofMaterial:'shingle',window:'W4',entrance:'E4',ornaments:['O6'],palette:'P05'}},
];
const TIMES=[{id:'use',label:'使用中',a:null},{id:'a0',label:'放棄直後',a:0},{id:'a25',label:'空き家25年',a:25},{id:'a30',label:'30年（廃墟化直後）',a:30},{id:'a50',label:'50年（廃墟20年）',a:50},{id:'a200',label:'200年',a:200},{id:'a500',label:'500年',a:500}];
const clocksOf=a=>a===null?{abandonedYears:null,ruinedYears:null}:{abandonedYears:a,ruinedYears:a>=RUIN_AT?a-RUIN_AT:null};
const specOf=(m,use='house')=>normalizeSpec({use,...m.spec});

const files=[],appearances=[];
const save=async(name,raster)=>{const png=raster.png();await writeFile(`${out}/${name}.png`,png);files.push({name,width:raster.width,height:raster.height,sha256:createHash('sha256').update(png).digest('hex')});};
const paint=(g,key,spec,cx,gy,a,w,draw=t=>drawArchitecture(t,spec,cx,gy))=>{
 const ap=ruinAppearanceOf(spec,clocksOf(a),w.climate);
 drawWeatheredArchitecture(g,key,draw,ap,w.look);
 return ap;
};
const backdrop=(r,w,horizon)=>{r.rect(0,0,r.width,r.height,SKY);r.rect(0,horizon,r.width,r.height-horizon,w.look.ground);};

// ---- 1. materials × times, one sheet per biome ----
const CW=52,CH=46,GY=38;
for(const w of worlds){
 const r=new Raster(CW*TIMES.length,CH*MATERIALS.length);
 MATERIALS.forEach((m,i)=>TIMES.forEach((t,j)=>{
  const cell=new Raster(CW,CH);backdrop(cell,w,GY);
  const ap=paint(cell,'sample:'+m.id,specOf(m),CW>>1,GY,t.a,w);
  r.blit(cell,j*CW,i*CH);
  appearances.push({sheet:'ages',biome:w.biome,material:m.id,time:t.id,...ap});
 }));
 await save('ages_'+w.biome,r);
}
// ---- 2. biomes × materials at 50 / 200 / 500 years ----
for(const a of [30,50,200,500]){
 const r=new Raster(CW*MATERIALS.length,CH*worlds.length);
 worlds.forEach((w,i)=>MATERIALS.forEach((m,j)=>{const cell=new Raster(CW,CH);backdrop(cell,w,GY);paint(cell,'sample:'+m.id,specOf(m),CW>>1,GY,a,w);r.blit(cell,j*CW,i*CH);}));
 await save('biomes_'+a,r);
}
// ---- 3. 320×180 stages: a row of housing parts behind, larger buildings in front, one in use ----
const STAGE=[
 {key:'stage:hall',m:'ashlar',use:'hall',x:62,gy:150},
 {key:'stage:workshop',m:'plank',use:'workshop',x:128,gy:156},
 {key:'stage:granary',m:'earth',use:'granary',x:178,gy:150,spec:{roofFamily:'R05',window:'W6'}},
 {key:'stage:house1',m:'rubble',use:'house',x:220,gy:158},
 {key:'stage:house2',m:'wattle',use:'house',x:256,gy:152},
 {key:'stage:inuse',m:'mixed',use:'house',x:294,gy:160,inUse:true},
];
const PARTS=[['log',0],['earth',1],['rubble',2],['wattle',3],['plank',4],['ashlar',5],['mixed',6],['log',7],['earth',8],['rubble',9],['wattle',10],['plank',11]];
const STAGE_TIMES=[0,30,50,200,500];
for(const w of worlds)for(const a of STAGE_TIMES){
 const r=new Raster(320,180);r.rect(0,0,320,180,SKY);r.rect(0,120,320,60,w.look.ground);r.rect(0,118,320,2,w.look.ground);
 // housing parts (near size) in the live miniature drawing, abandoned at the same time
 for(const [mid,i] of PARTS){
  const m=MATERIALS.find(x=>x.id===mid),spec=specOf(m),x=20+i*24,y=134-(i%2)*3;
  paint(r,'stage:part:'+i,spec,x,y,a,w,t=>drawMiniature(t,spec,x,y,'near'));
 }
 for(const b of STAGE){
  const m=MATERIALS.find(x=>x.id===b.m),spec=normalizeSpec({...m.spec,...(b.spec??{}),use:b.use});
  paint(r,b.key,spec,b.x,b.gy,b.inUse?null:a,w);
 }
 await save(`stage_${w.biome}_${a}`,r);
}
// ---- 4. the live ruin next to this prototype at ruinedYears 0 (same outline, foundation kept) ----
{
 const w=worlds.find(x=>x.biome==='temperate_forest'),r=new Raster(CW*MATERIALS.length,CH*2);
 MATERIALS.forEach((m,j)=>{
  const spec=specOf(m),live=new Raster(CW,CH),proto=new Raster(CW,CH);backdrop(live,w,GY);backdrop(proto,w,GY);
  drawRuin(live,'sample:'+m.id,t=>drawArchitecture(t,spec,CW>>1,GY));
  drawWeatheredArchitecture(proto,'sample:'+m.id,t=>drawArchitecture(t,spec,CW>>1,GY),ruinAppearanceOf(spec,{abandonedYears:0,ruinedYears:0},{wet:0,warm:0,frost:0,arid:0}),w.look);
  r.blit(live,j*CW,0);r.blit(proto,j*CW,CH);
 });
 await save('live_ruin_vs_d1a',r);
}

const report={issue:37,stage:'D1a',ruleId:RUIN_WEATHERING_RULE_ID,status:'PROTOTYPE — development clocks; not a world, save or history',
 scenario:{vacatedAt:0,ruinedAt:RUIN_AT,note:'Development timeline. The live game would read both clocks from confirmed housing / facility events (D0 §3).'},
 parameters:RUIN_PARAMETERS,
 worlds:worlds.map(w=>({biome:w.biome,seed:w.seed,effectiveTemperature:w.baseline.effectiveTemperature,effectiveMoisture:w.baseline.effectiveMoisture,annualTemperatureRangeIndex:w.baseline.annualTemperatureRangeIndex,climate:w.climate,look:w.look})),
 materials:MATERIALS.map(m=>({id:m.id,label:m.label,spec:specOf(m)})),times:TIMES,appearances,files};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img=(n,scale)=>{const f=files.find(x=>x.name===n);return `<img src="${n}.png" width="${f.width*scale}" height="${f.height*scale}" alt="${esc(n)}" loading="lazy">`;};
const grid=(cols,rows,name,scale,cw=CW,ch=CH)=>`<div class="sheet" style="grid-template-columns:9em repeat(${cols.length},${cw*scale}px)"><span></span>${cols.map(c=>`<b>${esc(c)}</b>`).join('')}
<div class="rows" style="grid-row:2/span ${rows.length}">${rows.map(r=>`<span style="height:${ch*scale}px">${esc(r)}</span>`).join('')}</div><div class="img" style="grid-column:2/span ${cols.length};grid-row:2/span ${rows.length}">${img(name,scale)}</div></div>`;
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 37 D1a 廃墟の風化</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}img{display:block;image-rendering:pixelated}
.scroll{overflow-x:auto}.sheet{display:grid;gap:0;align-items:end}.sheet b{font-size:12px;padding:2px 4px}.rows span{display:flex;align-items:center;font-size:12px;padding-right:6px}
.stages{display:grid;grid-template-columns:repeat(4,640px);gap:8px}.stages figure{margin:0}figcaption{font-size:12px}small{color:#5d6a5f}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #c8ccc0;padding:2px 6px;text-align:right}</style>
<main><h1>Issue #37 D1a｜廃墟の風化・苔・蔦（独立描画）</h1>
<p><b>PROTOTYPE。</b>開発用の時計（放棄0年目に空き家、${RUIN_AT}年目に廃墟化）と各バイオームの代表seedの気候で描いた比較。世界・保存・歴史には接続していない。地表の植物・地面の回復はD1b。</p>
<h2>1. 建材×経過年数</h2>${worlds.map(w=>`<h3>${LABEL[w.biome]} <small>seed ${w.seed}／湿潤 ${w.climate.wet}・温暖 ${w.climate.warm}・凍結 ${w.climate.frost}・乾燥 ${w.climate.arid}</small></h3><div class="scroll">${grid(TIMES.map(t=>t.label),MATERIALS.map(m=>m.label),'ages_'+w.biome,3)}</div>`).join('')}
<h2>2. バイオーム×建材</h2>${[30,50,200,500].map(a=>`<h3>放棄から${a}年</h3><div class="scroll">${grid(MATERIALS.map(m=>m.label),worlds.map(w=>LABEL[w.biome]),'biomes_'+a,3)}</div>`).join('')}
<h2>3. 320×180の舞台（右端の家だけ使用中）</h2>${worlds.map(w=>`<h3>${LABEL[w.biome]}</h3><div class="scroll"><div class="stages">${STAGE_TIMES.map(a=>`<figure>${img(`stage_${w.biome}_${a}`,2)}<figcaption>放棄から${a}年${a>=RUIN_AT?`（廃墟${a-RUIN_AT}年）`:''}</figcaption></figure>`).join('')}</div></div>`).join('')}
<h3>原寸</h3><div class="stages">${STAGE_TIMES.map(a=>`<figure>${img(`stage_temperate_forest_${a}`,1)}<figcaption>温帯林 ${a}年</figcaption></figure>`).join('')}</div>
<h2>4. 本編の廃墟（上）と、この試作の廃墟化0年・被覆なし（下）</h2><p>試作の廃墟は屋根を失い、壁が軒まで立った状態から始まり、数十年で本編の輪郭まで崩れる。基礎は残す（D0 §6：基礎の痕跡）。</p><div class="scroll">${img('live_ruin_vs_d1a',3)}</div>
<h2>5. 気候係数と200年後の値</h2><table><tr><th>バイオーム</th><th>湿潤</th><th>温暖</th><th>凍結</th><th>乾燥</th>${MATERIALS.map(m=>`<th>${esc(m.id)} 壁τ</th>`).join('')}<th>苔(石)</th><th>蔦</th><th>砂</th></tr>
${worlds.map(w=>{const at=id=>appearances.find(x=>x.biome===w.biome&&x.material===id&&x.time==='a200');return `<tr><th>${LABEL[w.biome]}</th><td>${w.climate.wet}</td><td>${w.climate.warm}</td><td>${w.climate.frost}</td><td>${w.climate.arid}</td>${MATERIALS.map(m=>`<td>${at(m.id).wallTau}</td>`).join('')}<td>${at('rubble').moss}</td><td>${at('rubble').vine}</td><td>${at('rubble').sand}</td></tr>`;}).join('')}</table>
</main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue37-d1a',images:files.length,out}));
