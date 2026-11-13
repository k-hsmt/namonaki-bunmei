/**
 * Issue #47 B2e: acceptance audit of the climate, flora and their drawing in the live game (design §10).
 *
 *   npm run build && node scripts/audit-issue47-b2e.mjs   →  artifacts/biome47-b2e/{report.json,gallery.html,*.png}
 *
 * Node: climate distribution, multi-seed worlds at years 0/100/1000/10000 advanced in one go and in steps,
 * past observation, save → restore, save size, plant placement invariants, settlements on harsh biomes.
 * Browser (Playwright Chromium): pixels of every site and year match across batch/step/restored worlds and
 * site switching; drawing time; the same terrain under the 7 biomes (forced climate: TEST ONLY, never saved).
 * Exits 1 when an acceptance check fails. Env: CHROMIUM_PATH, B2E_PORT, B2E_QUICK=1 (fewer worlds, 1000 years).
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {FLORA_SITES,describeFloraPatch} from '../dist/flora/local-flora-v1.js';
import {planFloraScene} from '../dist/flora/flora-scene-v1.js';
import {sceneOccupiedPlots} from '../dist/scene/flora-draw.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldFloraAt,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';

const out='artifacts/biome47-b2e',quick=process.env.B2E_QUICK==='1',YEARS=quick?[0,100,1000]:[0,100,1000,10000];
await mkdir(out,{recursive:true});
const failures=[],fail=m=>{failures.push(m);console.error('FAIL',m);};
const check=(ok,m)=>{if(!ok)fail(m);return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex').slice(0,16);
const r3=v=>Math.round(v*1000)/1000;
const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};

// 1. Climate distribution with the production generator (B1c audited the prototype; B2a proved them equal on 1..1000).
const shares=(seeds)=>{const n=Object.fromEntries(BIOME_KINDS.map(b=>[b,0]));let transition=0;for(const s of seeds){const c=generateClimateBaseline(s);n[c.dominantBiome]++;if(c.transition)transition++;}
 return {seeds:seeds.length,shares:Object.fromEntries(BIOME_KINDS.map(b=>[b,r3(n[b]/seeds.length)])),transition:r3(transition/seeds.length)};};
const distribution={sequential1000:shares(Array.from({length:1000},(_,i)=>i+1)),sequential100000:shares(Array.from({length:100000},(_,i)=>i+1))};
for(const b of ['desert','tundra']){const s=distribution.sequential100000.shares[b];check(s>=.1&&s<=.12,`${b} share ${s} outside 10–12% (100,000 seeds)`);
 const t=distribution.sequential1000.shares[b];check(t>=.08&&t<=.14,`${b} share ${t} outside the 8–14% band (1000 seeds)`);}

// 2. Worlds: one per biome, a transition world, and a second desert and temperate seed (same biome, other terrain).
const firstSeed=(f,after=0)=>{for(let s=after+1;s<20000;s++)if(f(generateClimateBaseline(s)))return s;throw Error('no seed');};
const pure=b=>c=>c.dominantBiome===b&&!c.transition;
const cases=[...BIOME_KINDS.map(b=>({id:b,seed:firstSeed(pure(b))})),{id:'transition',seed:firstSeed(c=>c.transition?.distance===1)}];
if(!quick)cases.push({id:'desert-2',seed:firstSeed(pure('desert'),cases[0].seed)},{id:'temperate_forest-2',seed:firstSeed(pure('temperate_forest'),cases[3].seed)});
const quickCases=quick?cases.filter(c=>['desert','temperate_forest','tundra'].includes(c.id)):cases;

const stageShares=(w,y)=>{const n=[0,0,0,0,0];let total=0;for(let i=0;i<3;i++)for(const v of worldFloraAt(w,y,i))if(v){n[v.stage]++;total++;}return n.map(k=>Math.round(k/total*1000)/10);};
const land=(r,x,y)=>r.surface[y*320+x]===1&&r.grade[y*320+x]<2&&r.bearing[y*320+x]===0;
const worlds=[];
for(const c of quickCases){
 const t0=Date.now(),created=(await createNewArchitectureWorld(c.seed)).architecture,climate=generateClimateBaseline(c.seed);
 const chain=[created];for(let k=1;k<YEARS.length;k++)chain.push(await advanceArchitectureWorld(chain[k-1],YEARS[k]-YEARS[k-1],'automatic'));
 const batch=await advanceArchitectureWorld(created,YEARS.at(-1),'automatic');
 const B=architectureProductionSession(batch),last=YEARS.at(-1);
 check(B.state.year===last,`${c.id}: batch reached year ${B.state.year}, not ${last}`);
 const saves=[],years=[];
 for(const [k,y] of YEARS.entries()){
  const S=architectureProductionSession(chain[k]),save=await prepareWorldSessionSave(S),json=(await encodeWorldSave(save)).json;
  const restored=restoreWorldSession(await decodeWorldSave(json));
  saves.push(json);
  let sameFlora=true,sameSnapshot=true,plants=0,trees=0,violations=0;
  for(let i=0;i<3;i++){
   const views=worldFloraAt(B,y,i);
   sameFlora&&=JSON.stringify(views)===JSON.stringify(worldFloraAt(S,y,i))&&JSON.stringify(views)===JSON.stringify(worldFloraAt(restored,y,i));
   const o=observeGeneratedWorldSession(B,y,i);sameSnapshot&&=JSON.stringify(o.snapshot)===JSON.stringify(observeGeneratedWorldSession(S,y,i).snapshot);
   const site=FLORA_SITES[i],physics=readOwnedRecordPhysics(o.ground.terrain.sites[site].physics),occupied=sceneOccupiedPlots(o);
   const plan=planFloraScene({seed:c.seed,site,patches:B.flora.sites[site],views,physics,occupied});
   for(const p of plan){
    const index=Math.floor((p.y-96)/8)*40+Math.floor(p.x/8),d=describeFloraPatch(B.flora.sites[site][index]);
    const bad=![[0,0],[1,0],[0,1],[1,1]].every(([dx,dy])=>land(physics,p.x+dx,p.y+dy))||occupied.some(q=>p.x>=q.x-4&&p.x<q.x+q.width+4&&p.y>=q.y-4&&p.y<q.y+q.depth+4)
     ||(p.kind==='tree'&&(views[index].stage<3||p.id!==d.canopy||d.biome==='tundra'||(d.biome==='desert'&&d.habitat==='ordinary')));
    if(bad)violations++;plants++;if(p.kind==='tree')trees++;
   }
  }
  check(sameFlora,`${c.id} year ${y}: flora differs between one-go, stepped and restored worlds`);
  check(sameSnapshot,`${c.id} year ${y}: observed history differs between one-go and stepped worlds`);
  check(violations===0,`${c.id} year ${y}: ${violations} plants break placement rules`);
  const pop=[0,1,2].map(i=>observeGeneratedWorldSession(B,y,i).snapshot);
  years.push({year:y,saveBytes:json.length,climateFloraBytes:JSON.stringify({climate:save.climate,flora:save.flora}).length,plants,trees,
   stages:stageShares(B,y),population:pop.reduce((s,p)=>s+p.population,0),structures:pop.reduce((s,p)=>s+p.objects.length,0)});
 }
 const batchSave=await prepareWorldSessionSave(B);
 check(JSON.stringify(batchSave)===JSON.stringify(await prepareWorldSessionSave(architectureProductionSession(chain.at(-1)))),`${c.id}: the one-go and stepped saves differ at year ${last}`);
 const batchJson=(await encodeWorldSave(batchSave)).json;
 worlds.push({...c,climate:{dominant:climate.dominantBiome,transition:climate.transition,effectiveTemperature:climate.effectiveTemperature,effectiveMoisture:climate.effectiveMoisture},years,batchJson,saves,seconds:Math.round((Date.now()-t0)/1000)});
 console.log(c.id,'seed',c.seed,'done in',Math.round((Date.now()-t0)/1000)+'s');
}
// Harsh biomes start and grow settlements like any other world (the civilisation never reads the climate).
const settlements=[];
for(const b of BIOME_KINDS){
 let started=0,grown=0,n=0;
 for(let s=0,seed=0;n<(quick?2:5);n++){seed=firstSeed(pure(b),seed);const w=architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,300,'automatic'));
  const snaps=[0,1,2].map(i=>observeGeneratedWorldSession(w,300,i).snapshot);started+=+(snaps.some(x=>x.population>0));grown+=+(snaps.reduce((t,x)=>t+x.objects.length,0)>0);void s;}
 settlements.push({biome:b,worlds:n,withPopulation:started,withStructures:grown});
 check(started===n,`${b}: a new world has no population by year 300`);
}

// 3. Browser: pixels, switching, timing, forced-climate comparison.
const PORT=Number(process.env.B2E_PORT??5361);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const images=[];let pixelChecks=[],timing=[],forced=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(1800000);
 await page.route('**/__b2e__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>B2e</title>'}));
 await page.goto('http://127.0.0.1:'+PORT+'/__b2e__');
 for(const w of worlds){
  const r=await page.evaluate(async({batchJson,saves,years})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),M=await import('/scene/motion-frame.js');
   const url=(session,y,i)=>{const c=document.createElement('canvas');S.drawWorldSession(c,session,y,i);return c.toDataURL('image/png');};
   const batch=S.restoreWorldSession(await decodeWorldSave(batchJson)),rows=[],shots=[],times={draw:[],prepare:[]};
   for(const [k,y] of years.entries()){
    const step=S.restoreWorldSession(await decodeWorldSave(saves[k]));
    for(let i=0;i<3;i++){const a=url(batch,y,i),b=url(step,y,i);rows.push({year:y,site:i,same:a===b});if(y===years.at(-1)||y===years[2]||y===0)shots.push({year:y,site:i,png:a});}
    // Switching sites back and forth on one session gives the same pixels.
    const first=[0,1,2].map(i=>url(batch,y,i)),again=[2,0,1].map(i=>url(batch,y,i));
    rows.push({year:y,site:'switch',same:again[0]===first[2]&&again[1]===first[0]&&again[2]===first[1]});
   }
   const y=years.at(-1);for(let i=0;i<3;i++)for(let n=0;n<3;n++){
    let t=performance.now();url(batch,y,i);times.draw.push(performance.now()-t);
    const o=S.observeGeneratedWorldSession(batch,y,i);t=performance.now();M.prepareSceneMotion(o,S.worldStructurePainter(batch));times.prepare.push(performance.now()-t);
   }
   return {rows,shots,times};
  },{batchJson:w.batchJson,saves:w.saves,years:YEARS});
  for(const row of r.rows)check(row.same,`${w.id} year ${row.year} site ${row.site}: pixels differ (one-go vs stepped/restored, or site switching)`);
  pixelChecks.push({world:w.id,checks:r.rows.length,same:r.rows.filter(x=>x.same).length});
  const med=a=>{const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.floor(s.length/2)]);};
  timing.push({world:w.id,year:YEARS.at(-1),drawMedianMs:med(r.times.draw),drawMaxMs:Math.round(Math.max(...r.times.draw)),prepareMedianMs:med(r.times.prepare),prepareMaxMs:Math.round(Math.max(...r.times.prepare))});
  for(const s of r.shots)images.push({name:`world_${w.id}_y${s.year}_site${s.site}`,png:s.png,world:w.id,year:s.year,site:s.site});
 }
 // Same terrain under the 7 biomes: one real world, its climate replaced in drawing only (TEST ONLY, never saved).
 const base=worlds.find(w=>w.id==='temperate_forest')??worlds[0],forcedYear=YEARS.includes(1000)?1000:YEARS.at(-1);
 const climates=Object.fromEntries(BIOME_KINDS.map(b=>[b,generateClimateBaseline(firstSeed(pure(b)))]));
 forced=await page.evaluate(async({batchJson,climates,year})=>{
  const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),D=await import('/scene/draw-generated-review.js');
  const L=await import('/flora/local-flora-v1.js'),G=await import('/flora/flora-growth-v1.js');
  const session=S.restoreWorldSession(await decodeWorldSave(batchJson)),painter=S.worldStructurePainter(session),out=[];
  for(const [biome,climate] of Object.entries(climates)){
   const flora=L.createLocalFlora(session.state.seed,climate,session.architecture.terrain.review.terrain);
   for(let i=0;i<3;i++){
    const o=S.observeGeneratedWorldSession(session,year,i),site=o.ground.site;
    const views=G.floraSiteAt({seed:session.state.seed,climate,flora,environment:session.review.environment,year,site,vegetation:o.ground.vegetation??[]});
    const c=document.createElement('canvas');D.drawGeneratedSceneReview(c,o,undefined,undefined,{...painter,flora:()=>({seed:session.state.seed,patches:flora.sites[site],views})});
    out.push({biome,site:i,png:c.toDataURL('image/png')});
   }
  }
  return out;
 },{batchJson:base.batchJson,climates,year:forcedYear});
 for(const f of forced)images.push({name:`forced_${f.biome}_site${f.site}`,png:f.png,biome:f.biome,site:f.site});
 // The 7 forced frames of each site must differ (more than a colour cast is checked by eye in the gallery).
 for(let i=0;i<3;i++){const h=new Set(forced.filter(f=>f.site===i).map(f=>sha(f.png)));check(h.size===7,`forced climates give only ${h.size} distinct frames at site ${i}`);}
 forced.base={world:base.id,seed:base.seed,year:forcedYear};
}finally{await browser?.close();server.kill();}

// 4. Performance and size budgets (B2d: 150 ms per site preparation).
for(const t of timing)check(t.prepareMedianMs<=150,`${t.world}: scene preparation median ${t.prepareMedianMs} ms exceeds 150 ms`);

// 5. Write the report and gallery.
const assets=[];
for(const im of images){const raw=Buffer.from(im.png.slice(im.png.indexOf(',')+1),'base64');await writeFile(`${out}/${im.name}.png`,raw);assets.push({name:im.name,sha256:createHash('sha256').update(raw).digest('hex'),bytes:raw.length});}
const report={issue:47,stage:'B2e',status:failures.length?'FAILED':'PASSED',sourceSHA:process.env.REVIEW_SOURCE_SHA??'unverified-local',quick,years:YEARS,failures,distribution,
 worlds:worlds.map(({batchJson,saves,...w})=>w),settlements,pixelChecks,timing,forcedClimate:{...forced.base,note:'Drawing-only comparison of one real world under each biome; never saved, never history.'},assets};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const img=(n,w=320)=>`<img src="${n}.png" width="${w}" height="${w*180/320}" loading="lazy" alt="${esc(n)}">`;
const SITE=['川辺','丘陵','入り江'];
const worldRows=worlds.map(w=>`<section><h3>${esc(LABEL[w.id.replace('-2','')]??'移行帯')}${w.id.endsWith('-2')?'（別seed）':''} <small>seed ${w.seed}／${esc(w.climate.dominant)}${w.climate.transition?'→'+esc(w.climate.transition.biome):''}</small></h3><div class="scroll"><table><tr><th></th>${[0,YEARS[2],YEARS.at(-1)].filter((v,i,a)=>a.indexOf(v)===i).map(y=>`<th>${y}年</th>`).join('')}</tr>${[0,1,2].map(i=>`<tr><th>${SITE[i]}</th>${[0,YEARS[2],YEARS.at(-1)].filter((v,k,a)=>a.indexOf(v)===k).map(y=>`<td>${img(`world_${w.id}_y${y}_site${i}`)}</td>`).join('')}</tr>`).join('')}</table></div></section>`).join('');
const forcedRows=[0,1,2].map(i=>`<tr><th>${SITE[i]}</th>${BIOME_KINDS.map(b=>`<td>${img(`forced_${b}_site${i}`,240)}</td>`).join('')}</tr>`).join('');
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 47 B2e 受入監査</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}.scroll{overflow-x:auto}table{border-spacing:6px}th{font-size:12px;text-align:left;white-space:nowrap}img{display:block;image-rendering:pixelated}small{color:#5d6a5f;font-weight:400}.z img{width:1280px;height:720px}</style>
<main><h1>Issue #47 B2e 受入監査：${report.status}</h1><p>年 ${YEARS.join('／')}。失敗 ${failures.length}件。詳細は report.json。</p>
<h2>同じ地形×7バイオーム（描画のみの比較。保存・歴史ではない）</h2><p>${esc(forced.base.world)}（seed ${forced.base.seed}）の${forced.base.year}年</p><div class="scroll"><table><tr><th></th>${BIOME_KINDS.map(b=>`<th>${LABEL[b]}</th>`).join('')}</tr>${forcedRows}</table></div>
<h3>4倍（丘陵）</h3><div class="scroll z"><table>${BIOME_KINDS.map(b=>`<tr><th>${LABEL[b]}</th><td>${img(`forced_${b}_site1`,1280)}</td></tr>`).join('')}</table></div>
<h2>実際の世界（年ごと）</h2>${worldRows}</main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue47-b2e',status:report.status,failures,worlds:worlds.length,images:images.length,out}));
if(failures.length)process.exitCode=1;
