/**
 * Issue #38 D1b: habitat candidates, suitability and appearance plans on real worlds (PROTOTYPE, fauna-habitat-v1).
 * Appearance only: the plans are derived from each confirmed year and never saved (D0 §3, §11). The live game does
 * not load src/fauna.
 *
 *   npm run build && node scripts/preview-fauna-d1b.mjs  →  artifacts/fauna38-d1b/{gallery.html,report.json,*.png}
 *
 * Worlds: the first stable seed of each of the 7 biomes, advanced to year 3000 in one go, × 3 sites.
 *  - map_<biome>_<site>_<year>.png: the record-coordinate map of a year (plants, water, standing plots), the habitat
 *    candidates above their threshold and the planned animals with the D1a sprites. "virtual" is the same year with
 *    every building and the population removed: a VIRTUAL condition that no saved world has (no civilisation-free
 *    year exists in the live worlds, which start with people at year 0).
 *  - timeline_<biome>_<site>.png: which groups show over the years, fixed thresholds against smoothing over earlier years.
 * Checks (exit 1 on failure): every animal's body fits that year's land or water off every standing plot, no two animals
 * overlap; plans are
 * the same from a world advanced in steps (later history never changes an earlier year); plans are deterministic;
 * observing leaves the save unchanged and the save stores no fauna.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Raster} from './lib/pixel-raster.mjs';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldStructurePainter,prepareWorldSessionSave} from '../dist/story/world-session.js';
import {sceneOccupiedPlots} from '../dist/scene/flora-draw.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {drawFauna,faunaSprite,faunaBounds} from '../dist/fauna/fauna-sprites-v1.js';
import {FAUNA_HABITAT_RULE_ID,HABITAT_PARAMETERS,FAUNA_GROUPS,faunaHabitatCandidates,faunaSuitability,candidateThreshold,smoothedSuitability,planFaunaAppearance,faunaBodyFits} from '../dist/fauna/fauna-habitat-v1.js';

const out='artifacts/fauna38-d1b',END=3000,STEP=20,WINDOW=3,YEARLY=[1000,1200],YEAR_WINDOW=10,FLICKER=10,SHOW=[0,1000,3000],VIRTUAL_AT=1000,STEPPED_AT=1000;
await mkdir(out,{recursive:true});
const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
const SITE={'river-bank':'川辺','hill-side':'丘陵','coast-inlet':'入り江'};
const GROUP_LABEL={'large-herbivore':'大型草食','small-ground':'小型地上','small-bird':'小鳥','water-bird':'水鳥','flying-bird':'飛翔鳥'};
const GROUP_COLOR={'large-herbivore':'#b5462f','small-ground':'#c98a1b','small-bird':'#7b4fa0','water-bird':'#1f6fb5','flying-bird':'#2b2b2b'};
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const files=[];
const save=async(name,raster,extra={})=>{const png=raster.png();await writeFile(`${out}/${name}.png`,png);files.push({name,width:raster.width,height:raster.height,sha256:createHash('sha256').update(png).digest('hex'),...extra});};
const firstSeed=b=>{for(let s=1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}throw Error('no seed');};

/** The habitat input of a site in a confirmed year (read-only views of the session). */
function yearInput(session,year,i,virtual=false){
 const o=observeGeneratedWorldSession(session,year,i),ph=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),f=worldStructurePainter(session).flora(o);
 return {seed:session.state.seed,site:o.ground.site,year,surface:ph.surface,grade:ph.grade,patches:f.patches,views:f.views,
  standing:virtual?[]:sceneOccupiedPlots(o),population:virtual?0:o.composition.population};
}
const suitMap=(input)=>new Map(faunaHabitatCandidates(input.seed,input.site).map(c=>[c.id,faunaSuitability(input,c)]));
const animals=p=>p.groups.reduce((s,g)=>s+g.members.length,0);
const shown=p=>new Set(p.groups.map(g=>g.candidate+'|'+g.group));
/** Members verified again against the year they belong to. */
function verify(plan,input,label){
 const boxes=plan.groups.flatMap(g=>g.members.map(m=>{const b=faunaBounds(faunaSprite(m.kind,m.size,m.pose,0)),r=Math.max(-b.left,b.right);return {l:m.x-r,r:m.x+r,t:m.y+b.top,b:m.y+b.bottom};}));
 for(let a=0;a<boxes.length;a++)for(let c=a+1;c<boxes.length;c++){const p=boxes[a],q=boxes[c];check(!(p.l<=q.r&&p.r>=q.l&&p.t<=q.b&&p.b>=q.t),`${label}: two animals overlap`);}
 for(const g of plan.groups)for(const m of g.members){
  check(faunaBodyFits(input,m.kind,m.size,m.pose,m.x,m.y),`${label}: ${m.kind} at ${m.x},${m.y} does not fit`);
  if(g.group!=='flying-bird')check(!input.standing.some(p=>m.x>=p.x&&m.x<p.x+p.width&&m.y>=p.y&&m.y<p.y+p.depth),`${label}: ${m.kind} stands on a plot`);
 }
}

// ---------------------------------------------------------------- the map image of a plan
function drawMap(input,plan){
 const r=new Raster(320,180);r.rect(0,0,320,96,'#c9cdb8');
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){const s=input.surface[y*320+x];if(s===2)r.rect(x,y,1,1,'#6f8f9a');else if(s===3)r.rect(x,y,1,1,'#55788a');else if(s===1){
  const i=Math.floor((y-96)/8)*40+Math.floor(x/8),p=input.patches[i],v=input.views[i];
  r.rect(x,y,1,1,!p||!v?'#9a9a7a':v.stage===0?'#b9a77f':p[2]>=0&&v.stage>=3?'#5f7a4f':'#a8ad78');}}
 for(const p of input.standing){r.rect(p.x,p.y,p.width,p.depth,'#8a817a');r.rect(p.x,p.y,p.width,1,'#5c5650');r.rect(p.x,p.y+p.depth-1,p.width,1,'#5c5650');}
 const suits=suitMap(input);
 for(const c of faunaHabitatCandidates(input.seed,input.site)){
  const s=suits.get(c.id),over=FAUNA_GROUPS.filter(g=>s[g]>=candidateThreshold(input.seed,c,g));
  r.rect(c.x,c.y,1,1,over.length?GROUP_COLOR[over[0]]:'#3b3b3b');
 }
 const members=plan.groups.flatMap(g=>g.members.map(m=>({...m,group:g.group}))).sort((a,b)=>a.y-b.y);
 for(const m of members)drawFauna(r,m.kind,m.size,m.pose,0,m.x,m.y,m.facing);
 return r;
}

const worlds=[],seriesInfo=[];
for(const biome of BIOME_KINDS){
 const t0=Date.now(),seed=firstSeed(biome),created=(await createNewArchitectureWorld(seed)).architecture;
 const batch=architectureProductionSession(await advanceArchitectureWorld(created,END,'automatic'));
 const stepped=architectureProductionSession(await advanceArchitectureWorld(created,STEPPED_AT,'automatic'));
 const before=JSON.stringify(await prepareWorldSessionSave(batch));
 const sites=[];
 for(let i=0;i<3;i++){
  const series=[],history=[];let toggles={fixed:0,smoothed:0},zero=0,sum=0,sumVirtual=0,near=0,pairs=0;const kinds={},kindsVirtual={};
  let prevFixed=null,prevSmooth=null;
  for(let y=0;y<=END;y+=STEP){
   const input=yearInput(batch,y,i),virtual=yearInput(batch,y,i,true),suits=suitMap(input);
   history.push(suits);const window=history.slice(-WINDOW);
   const smoothed=new Map([...suits.keys()].map(id=>[id,smoothedSuitability(window.map(h=>h.get(id)))]));
   const fixed=planFaunaAppearance(input,suits),smooth=planFaunaAppearance(input,smoothed),vplan=planFaunaAppearance(virtual);
   verify(fixed,input,`${biome} ${y}/${i} fixed`);verify(smooth,input,`${biome} ${y}/${i} smoothed`);verify(vplan,virtual,`${biome} ${y}/${i} virtual`);
   const a=shown(fixed),b=shown(smooth);
   if(prevFixed){for(const k of new Set([...a,...prevFixed]))if(a.has(k)!==prevFixed.has(k))toggles.fixed++;for(const k of new Set([...b,...prevSmooth]))if(b.has(k)!==prevSmooth.has(k))toggles.smoothed++;}
   prevFixed=a;prevSmooth=b;
   const n=animals(fixed);sum+=n;sumVirtual+=animals(vplan);if(n===0)zero++;
   for(const g of fixed.groups)kinds[g.kind]=(kinds[g.kind]??0)+g.members.length;
   for(const g of vplan.groups)kindsVirtual[g.kind]=(kindsVirtual[g.kind]??0)+g.members.length;
   for(const c of faunaHabitatCandidates(seed,input.site))for(const g of FAUNA_GROUPS){const s=suits.get(c.id)[g];if(s>0){pairs++;if(Math.abs(s-candidateThreshold(seed,c,g))<.05)near++;}}
   series.push({year:y,fixed:FAUNA_GROUPS.map(g=>fixed.groups.filter(q=>q.group===g).reduce((s,q)=>s+q.members.length,0)),smoothed:FAUNA_GROUPS.map(g=>smooth.groups.filter(q=>q.group===g).reduce((s,q)=>s+q.members.length,0)),population:input.population});
  }
  // year-by-year flicker near a threshold (D0 §5): YEARLY years in steps of 1, fixed thresholds against the mean of the
  // last YEAR_WINDOW confirmed years (earlier years only; nothing about the screen is remembered)
  // a "flicker" is a toggle that is undone within FLICKER years (on, off, on again); other toggles follow lasting change
  const yearly=[],lastToggle={fixed:new Map(),smoothed:new Map()};let yToggle={fixed:0,smoothed:0},yFlicker={fixed:0,smoothed:0},yPrevF=null,yPrevS=null,ms=0,plans=0;
  const count=(mode,now,before,y)=>{for(const k of new Set([...now,...before]))if(now.has(k)!==before.has(k)){yToggle[mode]++;const l=lastToggle[mode].get(k);if(l!==undefined&&y-l<=FLICKER)yFlicker[mode]++;lastToggle[mode].set(k,y);}};
  for(let y=YEARLY[0];y<=YEARLY[1];y++){
   const input=yearInput(batch,y,i);let t=performance.now();const suits=suitMap(input);const fixed=planFaunaAppearance(input,suits);ms+=performance.now()-t;plans++;
   yearly.push(suits);const smooth=planFaunaAppearance(input,new Map([...suits.keys()].map(id=>[id,smoothedSuitability(yearly.slice(-YEAR_WINDOW).map(h=>h.get(id)))])));
   const a=shown(fixed),b=shown(smooth);
   if(yPrevF){count('fixed',a,yPrevF,y);count('smoothed',b,yPrevS,y);}
   yPrevF=a;yPrevS=b;
  }
  const samples=series.length,site=['river-bank','hill-side','coast-inlet'][i];
  sites.push({site,meanAnimals:Math.round(sum/samples*10)/10,meanAnimalsVirtual:Math.round(sumVirtual/samples*10)/10,zeroShare:Math.round(zero/samples*100),
   togglesPer1000:{fixed:Math.round(toggles.fixed/(END/1000)),smoothed:Math.round(toggles.smoothed/(END/1000))},
   yearlyToggles:yToggle,yearlyFlicker:yFlicker,planMs:Math.round(ms/plans*10)/10,nearThresholdShare:Math.round(near/pairs*1000)/10,kinds,kindsVirtual});
  // the timeline: per group two rows (fixed above, smoothed below), one column of 2 px per sampled year
  const T=new Raster(samples*2,FAUNA_GROUPS.length*10+2);T.rect(0,0,T.width,T.height,'#eef0e8');
  series.forEach((s,k)=>FAUNA_GROUPS.forEach((g,j)=>{if(s.fixed[j])T.rect(k*2,j*10+1,2,4,GROUP_COLOR[g]);if(s.smoothed[j])T.rect(k*2,j*10+5,2,4,GROUP_COLOR[g]);}));
  for(let y=0;y<=END;y+=500)T.rect(y/STEP*2,T.height-2,1,2,'#5d6b60');
  await save(`timeline_${biome}_${site}`,T,{world:biome,site,samples});
  seriesInfo.push({world:biome,site,series});
  // maps of the shown years and the virtual condition
  for(const y of [...SHOW,'virtual']){
   const input=y==='virtual'?yearInput(batch,VIRTUAL_AT,i,true):yearInput(batch,y,i),plan=planFaunaAppearance(input);
   check(JSON.stringify(plan)===JSON.stringify(planFaunaAppearance(input)),`${biome} ${y}/${i}: plan is not deterministic`);
   await save(`map_${biome}_${site}_${y}`,drawMap(input,plan),{world:biome,site,year:y,population:input.population,groups:plan.groups.map(g=>({kind:g.kind,group:g.group,members:g.members.length,suitability:g.suitability,threshold:g.threshold})),dropped:plan.dropped});
  }
  // later history never changes an earlier year: a world advanced only to STEPPED_AT plans the same
  for(const y of [0,STEPPED_AT/2,STEPPED_AT])check(JSON.stringify(planFaunaAppearance(yearInput(batch,y,i)))===JSON.stringify(planFaunaAppearance(yearInput(stepped,y,i))),`${biome} ${y}/${i}: plan differs in a world advanced only to ${STEPPED_AT}`);
 }
 const after=JSON.stringify(await prepareWorldSessionSave(batch));
 check(before===after,`${biome}: observing changed the save`);
 check(!/fauna/.test(after),`${biome}: the save stores fauna`);
 worlds.push({biome,seed,sites});
 console.log(biome,'seed',seed,Math.round((Date.now()-t0)/1000)+'s');
}

const report={issue:38,stage:'D1b',ruleId:FAUNA_HABITAT_RULE_ID,status:failures.length?'FAILED':'PASSED',failures,
 note:'PROTOTYPE. Plans are derived from confirmed years and never saved. "virtual" removes every building and the population from a real year: no saved world has that state.',
 years:{end:END,step:STEP,smoothingWindow:WINDOW,yearly:YEARLY,yearlyWindow:YEAR_WINDOW,flickerYears:FLICKER,shown:SHOW,virtualAt:VIRTUAL_AT,steppedAt:STEPPED_AT},parameters:HABITAT_PARAMETERS,worlds,series:seriesInfo,files};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const file=n=>files.find(f=>f.name===n);
const img=(n,scale)=>{const f=file(n);return `<img src="${n}.png" width="${f.width*scale}" height="${f.height*scale}" alt="${esc(n)}" loading="lazy">`;};
const groupsText=n=>{const f=file(n);return f.groups.length?f.groups.map(g=>`${g.kind}×${g.members}`).join('、'):'なし';};
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 38 D1b 生息候補と出現計画</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}img{display:block;image-rendering:pixelated}
.row{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0}figcaption{font-size:12px;max-width:640px}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #c8ccc0;padding:2px 6px;text-align:right}small{color:#5d6a5f}.key span{display:inline-block;width:10px;height:10px;margin:0 4px 0 12px}</style>
<main><h1>Issue #38 D1b｜生息候補・適性・出現計画（実際の世界）</h1>
<p><b>PROTOTYPE。</b>7バイオームの代表seedの世界を${END}年まで進め、確定した年ごとに生息候補（固定）・適性・出現計画を導いた。保存しない。「仮想（人なし）」は実際の年から建物と人口を除いたもので、保存されたどの世界にも無い状態（本編の世界は年0から人がいる）。地図は記録座標（鏡像なし）。</p>
<p class="key">凡例：${FAUNA_GROUPS.map(g=>`<span style="background:${GROUP_COLOR[g]}"></span>${GROUP_LABEL[g]}`).join('')}　点＝閾値を超えた生息候補（灰は超えていない）。地図の色：明るい緑＝草地・低木・若い植生、濃い緑＝樹林（段階3以上）、褐色＝裸地、灰の矩形＝建物・畑などの区画。</p>
<p>機械検査：${failures.length?`<b>${failures.length}件の失敗</b>`:'すべて合格'}（体が収まる、区画に乗らない、段階的に進めた世界と一致、決定的、保存が変わらない）。</p>
<h2>1. 世界・地区ごとの要約（${END/STEP+1}時点、${STEP}年ごと）</h2>
<table><tr><th>世界</th><th>seed</th><th>地区</th><th>平均頭数</th><th>仮想（人なし）</th><th>0頭の時点</th><th>表示の切替/1000年 固定</th><th>平滑化</th><th>${YEARLY[0]}〜${YEARLY[1]}年の毎年の切替 固定</th><th>平滑化（${YEAR_WINDOW}年）</th><th>うち${FLICKER}年以内に戻る点滅 固定</th><th>平滑化</th><th>1回の計画（ms）</th><th>閾値±0.05の割合</th><th>出現した種類（頭・時点の延べ）</th></tr>
${worlds.flatMap(w=>w.sites.map(s=>`<tr><th>${LABEL[w.biome]}</th><td>${w.seed}</td><td>${SITE[s.site]}</td><td>${s.meanAnimals}</td><td>${s.meanAnimalsVirtual}</td><td>${s.zeroShare}%</td><td>${s.togglesPer1000.fixed}</td><td>${s.togglesPer1000.smoothed}</td><td>${s.yearlyToggles.fixed}</td><td>${s.yearlyToggles.smoothed}</td><td>${s.yearlyFlicker.fixed}</td><td>${s.yearlyFlicker.smoothed}</td><td>${s.planMs}</td><td>${s.nearThresholdShare}%</td><td style="text-align:left">${Object.entries(s.kinds).map(([k,n])=>`${k} ${n}`).join('、')||'—'}</td></tr>`)).join('')}</table>
<h2>2. 地図（0年・1000年・3000年・仮想）</h2>
${worlds.map(w=>`<h3>${LABEL[w.biome]} <small>seed ${w.seed}</small></h3>${w.sites.map(s=>`<div class="row">${[...SHOW,'virtual'].map(y=>{const n=`map_${w.biome}_${s.site}_${y}`,f=file(n);return `<figure>${img(n,2)}<figcaption>${SITE[s.site]}・${y==='virtual'?`仮想（${VIRTUAL_AT}年から人と建物を除く）`:`${y}年（人口${f.population}）`}：${esc(groupsText(n))}</figcaption></figure>`;}).join('')}</div>`).join('')}`).join('')}
<h2>3. 年ごとの出現（各群の上段＝固定閾値、下段＝平滑化${WINDOW}時点）</h2><p><small>横軸は0〜${END}年（目盛り500年）。行は上から${FAUNA_GROUPS.map(g=>GROUP_LABEL[g]).join('・')}。</small></p>
${worlds.map(w=>`<h3>${LABEL[w.biome]}</h3><div class="row">${w.sites.map(s=>`<figure>${img(`timeline_${w.biome}_${s.site}`,2)}<figcaption>${SITE[s.site]}</figcaption></figure>`).join('')}</div>`).join('')}
</main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue38-d1b',status:report.status,failures:failures.length,images:files.length,out}));
if(failures.length)process.exitCode=1;
