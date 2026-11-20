/**
 * Issue #38 D1c: animals in the live 320×180 scenes — still images, the moving view, depth against plants and
 * structures, seasons, mirrored districts and cost (PROTOTYPE; development drawing only, D0 §12 D1c, §13).
 *
 *   npm run build && node scripts/preview-fauna-d1c.mjs  →  artifacts/fauna38-d1c/{gallery.html,report.json,*.png}
 *   FAUNA_D1C_QUICK=1: 2 worlds, 2 years, 2 moving scenes (CI).
 *
 * Node advances the 7 biome worlds (first stable seed each) to year 3050 and saves them. Chromium restores each save
 * and draws with the live code (drawWorldSession, prepareSceneMotion/drawSceneMotion); src/fauna/fauna-overlay-v1
 * paints the planned animals over those frames. The live game never loads src/fauna, so its screen is unchanged.
 *
 * D2: the live drawing (drawWorldSession, prepareSceneMotion/drawSceneMotion with the world painter) now paints the
 * animals itself; the script draws the frame below with the same painter without them and checks, for every still and
 * every moving frame, that the live result equals that frame plus the overlay pixel for pixel.
 * Checks (exit 1 on failure), on every moving frame: feet on that year's land (gentle grade) or water, bodies off
 * standing plots, flying birds only in the sky, no appearing or vanishing inside the screen, no jump; the still image
 * shows the scene at second 0; drawing twice gives the same pixels; the live frame below is left as it was outside
 * the animals' pixels.
 */
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave} from '../dist/story/world-session.js';
import {encodeWorldSave} from '../dist/story/world-storage.js';

const out='artifacts/fauna38-d1c',quick=process.env.FAUNA_D1C_QUICK==='1';
const BIOMES=quick?['temperate_forest','tropical_rainforest']:[...BIOME_KINDS];
// years in three different season phases (a phase lasts 25 years: 0 → 0, 1025 → 1, 3050 → 2; winter 3 is in §3)
const YEARS=quick?[0,3050]:[0,1025,3050],END=3050,FPS=12,SECONDS=10;
/** Moving scenes [biome, year, site]: herds, a village, a rainforest, water birds on a mirrored coast, a winter town. */
const MOVING=quick?[['temperate_forest',0,1],['tropical_rainforest',1025,0]]
 :[['steppe',0,1],['temperate_forest',0,1],['temperate_forest',1025,0],['tropical_rainforest',1025,0],['grassland',1025,2],['desert',1025,0],['tundra',1025,0],['boreal_forest',3050,2]];
const SEASON_SCENES=quick?[['temperate_forest',0,1]]:[['temperate_forest',0,1],['tundra',1025,0]];
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const firstSeed=b=>{for(let s=1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}throw Error('no seed');};
const worlds=[];
for(const biome of BIOMES){
 const seed=firstSeed(biome),t=Date.now(),w=await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,END,'automatic');
 worlds.push({biome,seed,json:(await encodeWorldSave(await prepareWorldSessionSave(architectureProductionSession(w)))).json});
 console.log(biome,'seed',seed,Math.round((Date.now()-t)/1000)+'s');
}

const PORT=Number(process.env.FAUNA_D1C_PORT??5391),failures=[],files=[],scenes=[],moving=[],seasons=[];
const check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
const savePng=async(name,dataUrl,extra={})=>{const raw=Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64');await writeFile(`${out}/${name}.png`,raw);files.push({name,sha256:createHash('sha256').update(raw).digest('hex'),...extra});};
let browser;
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(1800000);
 await page.route('**/__fauna_d1c__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>fauna d1c</title>'}));
 await page.goto(`http://127.0.0.1:${PORT}/__fauna_d1c__`);
 for(const w of worlds){
  const r=await page.evaluate(async({json,years,moving,seasons,fps,seconds})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),M=await import('/scene/motion-frame.js');
   const D=await import('/scene/draw-generated-review.js'),V=await import('/season/season-presentation-v1.js');
   const O=await import('/fauna/fauna-overlay-v1.js'),H=await import('/fauna/fauna-habitat-v1.js'),F=await import('/fauna/fauna-sprites-v1.js');
   const session=S.restoreWorldSession(await decodeWorldSave(json)),painter=S.worldStructurePainter(session),fails=[];
   // Since D2 the live painter draws the animals itself; `bare` is the same painter without them (the frame below)
   const bare={...painter,fauna:undefined,faunaKey:undefined};
   const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;return c;};
   const px=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,320,180).data;
   const count=plan=>plan?plan.groups.reduce((s,g)=>s+g.members.length,0):0;
   /** Screen-independent body box of a state (record coordinates). */
   const box=st=>{let top=Infinity,bottom=-Infinity,l=Infinity,rr=-Infinity;for(const q of F.faunaSprite(st.kind,st.size,st.pose,st.frame)){top=Math.min(top,st.y+q.y);bottom=Math.max(bottom,st.y+q.y+q.h-1);const a=st.facing===1?st.x+q.x:st.x-q.x-q.w+1;l=Math.min(l,a);rr=Math.max(rr,a+q.w-1);}return {top,bottom,l,rr};};
   const visible=st=>{const b=box(st);return b.rr>=0&&b.l<320;};
   /** Feet of a state on land (gentle grade) or water, body off standing plots; flying birds in the sky. */
   const placed=(input,st)=>{
    const rects=F.faunaSprite(st.kind,st.size,st.pose,st.frame),flying=F.FAUNA_GROUP[st.kind]==='flying-bird',{top,bottom,l,rr}=box(st);
    if(flying)return bottom<H.HABITAT_PARAMETERS.skyFloor||`${st.kind} below the sky floor`;
    const water=st.pose==='float'||st.pose==='dabble';
    for(const q of rects){if(q.y+q.h-1!==-(F.faunaLift(st.kind,st.size,st.pose,st.frame)))continue;for(let k=0;k<q.w;k++){const x=st.facing===1?st.x+q.x+k:st.x-q.x-k,y=st.y-F.faunaLift(st.kind,st.size,st.pose,st.frame),i=y*320+x;
     if(x<0||x>=320)continue;const s=input.surface[i];if(water?!(s===2||s===3):!(s===1&&input.grade[i]<=1))return `${st.kind} ${st.pose} feet off ${water?'water':'land'} at ${x},${y}`;}}
    if(input.standing.some(p=>l<p.x+p.width&&rr>=p.x&&top<p.y+p.depth&&bottom>=p.y))return `${st.kind} on a standing plot`;
    return true;
   };
   // ---- stills: every year and site, with and without animals
   const stills=[];
   for(const y of years)for(let i=0;i<3;i++){
    const o=S.observeGeneratedWorldSession(session,y,i),base=canvas();let t=performance.now();D.drawGeneratedSceneReview(base,o,undefined,undefined,bare);const baseMs=performance.now()-t,plain=base.toDataURL('image/png');
    t=performance.now();const ov=O.prepareFaunaOverlay(o,painter);const prepareMs=performance.now()-t;
    const c=canvas();c.getContext('2d').drawImage(base,0,0);t=performance.now();const stats=ov.draw(c,0,false);const drawMs=performance.now()-t;
    // D2: the live still image (drawWorldSession, animals included) equals the frame below plus the D1c overlay, and
    // drawing it again from scratch gives the same pixels
    const live=canvas();t=performance.now();S.drawWorldSession(live,session,y,i);const liveMs=performance.now()-t;
    const live2=canvas();S.drawWorldSession(live2,session,y,i);
    const same=live.toDataURL('image/png')===live2.toDataURL('image/png');
    if(live.toDataURL('image/png')!==c.toDataURL('image/png'))fails.push(`still ${y}/${i}: the live still differs from the frame plus the overlay`);
    // only animal pixels change: compare with the frame below
    const a=px(base),b=px(c);let changed=0;for(let k=0;k<a.length;k+=4)if(a[k]!==b[k]||a[k+1]!==b[k+1]||a[k+2]!==b[k+2])changed++;
    const input=O.faunaHabitatInput(o,painter);for(const st of ov.at(0)){const ok=placed(input,st);if(ok!==true)fails.push(`still ${y}/${i}: ${ok}`);}
    if(!same)fails.push(`still ${y}/${i}: not deterministic`);if(changed>stats.drawn)fails.push(`still ${y}/${i}: ${changed} px changed for ${stats.drawn} animal px`);
    stills.push({year:y,site:i,siteId:o.ground.site,mirror:o.ground.terrain.sites[o.ground.site].render.mirrorX===true,population:o.composition.population,season:V.seasonPhaseOfYear(y),
     animals:count(ov.plan),held:ov.loops.filter(l=>l.segments.length===1).length,kinds:ov.plan?ov.plan.groups.map(g=>`${g.kind}×${g.members.length}`):[],stats,baseMs,liveMs,prepareMs,drawMs,plain,png:c.toDataURL('image/png')});
   }
   // ---- moving scenes: one 10 s loop at 12 fps, the live moving view below
   const strips=[];
   for(const [y,i] of moving){
    const o=S.observeGeneratedWorldSession(session,y,i),input=O.faunaHabitatInput(o,painter);
    let t=performance.now();const prepared=M.prepareSceneMotion(o,bare);const livePrepareMs=performance.now()-t;
    t=performance.now();const withFauna=M.prepareSceneMotion(o,painter);const faunaPrepareMs=performance.now()-t;let liveFaunaMs=0;
    t=performance.now();const ov=O.prepareFaunaOverlay(o,painter);const prepareMs=performance.now()-t;
    const frames=fps*seconds,strip=document.createElement('canvas');strip.width=320;strip.height=180*frames;const sg=strip.getContext('2d');
    let liveMs=0,overlayMs=0,prev=new Map(),hidden={structures:0,plants:0,drawn:0};
    for(let k=0;k<frames;k++){
     const s=k/fps,c=canvas();t=performance.now();M.drawSceneMotion(c,prepared,s);liveMs+=performance.now()-t;
     t=performance.now();const stats=ov.draw(c,s,true);overlayMs+=performance.now()-t;hidden.structures+=stats.hiddenByStructures;hidden.plants+=stats.hiddenByPlants;hidden.drawn+=stats.drawn;
     sg.drawImage(c,0,180*k);
     // D2: the live moving view (animals included) equals the frame below plus the overlay, every frame
     const lc=canvas();t=performance.now();M.drawSceneMotion(lc,withFauna,s);liveFaunaMs+=performance.now()-t;
     if(lc.toDataURL('image/png')!==c.toDataURL('image/png'))fails.push(`moving ${y}/${i} ${s.toFixed(2)}s: the live frame differs from the frame plus the overlay`);
     const now=new Map(ov.at(s).map(st=>[st.id,st]));
     for(const st of now.values()){const ok=placed(input,st);if(ok!==true)fails.push(`moving ${y}/${i} ${s.toFixed(2)}s: ${ok}`);
      const was=prev.get(st.id),onScreen=visible(st);
      if(was&&Math.max(Math.abs(was.x-st.x),Math.abs(was.y-st.y))>(F.FAUNA_GROUP[st.kind]==='flying-bird'?5:2))fails.push(`moving ${y}/${i} ${s.toFixed(2)}s: ${st.kind} jumped`);
      if(!was&&k>0&&onScreen)fails.push(`moving ${y}/${i} ${s.toFixed(2)}s: ${st.kind} appeared inside the screen at x ${st.x}`);}
     for(const [id,was] of prev)if(!now.has(id)&&visible(was))fails.push(`moving ${y}/${i} ${s.toFixed(2)}s: ${was.kind} vanished inside the screen at x ${was.x}`);
     prev=now;
    }
    // the still image is the scene at second 0
    if(JSON.stringify(ov.at(0))!==JSON.stringify(O.prepareFaunaOverlay(S.observeGeneratedWorldSession(session,y,i),painter).at(0)))fails.push(`moving ${y}/${i}: second 0 differs from the still`);
    strips.push({year:y,site:i,siteId:o.ground.site,mirror:o.ground.terrain.sites[o.ground.site].render.mirrorX===true,frames,animals:count(ov.plan),kinds:ov.plan?ov.plan.groups.map(g=>`${g.kind}×${g.members.length}`):[],
     livePrepareMs,faunaPrepareMs,prepareMs,liveFrameMs:liveMs/frames,liveFaunaFrameMs:liveFaunaMs/frames,overlayFrameMs:overlayMs/frames,hidden,png:strip.toDataURL('image/png')});
   }
   // ---- seasons: the same scene in the 4 phases (development input, as Issue #36 D1a)
   const phases=[];
   for(const [y,i] of seasons)for(const p of [0,1,2,3]){
    const seasonal={...bare,flora:x=>({...painter.flora(x),season:V.seasonalViewOf(p,session.climate)})},o=S.observeGeneratedWorldSession(session,y,i),c=canvas();
    D.drawGeneratedSceneReview(c,o,undefined,undefined,seasonal);O.prepareFaunaOverlay(o,seasonal).draw(c,0,false);
    phases.push({year:y,site:i,phase:p,png:c.toDataURL('image/png')});
   }
   return {stills,strips,phases,fails};
  },{json:w.json,years:YEARS,moving:MOVING.filter(m=>m[0]===w.biome).map(m=>[m[1],m[2]]),seasons:SEASON_SCENES.filter(m=>m[0]===w.biome).map(m=>[m[1],m[2]]),fps:FPS,seconds:SECONDS});
  for(const f of r.fails)check(false,`${w.biome} ${f}`);
  for(const s of r.stills){
   const name=`still_${w.biome}_${s.siteId}_${s.year}`;await savePng(name,s.png);await savePng(name+'_plain',s.plain);
   const {png,plain,...rest}=s;scenes.push({world:w.biome,seed:w.seed,name,...rest});
  }
  for(const s of r.strips){const name=`moving_${w.biome}_${s.siteId}_${s.year}`;await savePng(name,s.png,{frames:s.frames,frameHeight:180});const {png,...rest}=s;moving.push({world:w.biome,seed:w.seed,name,...rest});}
  for(const s of r.phases){const name=`season_${w.biome}_${s.year}_${s.site}_${s.phase}`;await savePng(name,s.png);seasons.push({world:w.biome,name,year:s.year,site:s.site,phase:s.phase});}
  console.log(w.biome,'stills',r.stills.length,'moving',r.strips.length,'fails',r.fails.length);
 }
}finally{await browser?.close();server.kill();}

const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?Math.round(s[Math.floor(s.length/2)]*10)/10:0;},max=a=>a.length?Math.round(Math.max(...a)*10)/10:0;
const perf={stillBaseMedianMs:med(scenes.map(s=>s.baseMs)),stillLiveMedianMs:med(scenes.map(s=>s.liveMs)),movingPrepareWithoutMedianMs:med(moving.map(m=>m.livePrepareMs)),movingPrepareWithMedianMs:med(moving.map(m=>m.faunaPrepareMs)),liveFaunaFrameMedianMs:med(moving.map(m=>m.liveFaunaFrameMs)),overlayPrepareMedianMs:med(scenes.map(s=>s.prepareMs)),overlayPrepareMaxMs:max(scenes.map(s=>s.prepareMs)),overlayStillDrawMedianMs:med(scenes.map(s=>s.drawMs)),
 liveFrameMedianMs:med(moving.map(m=>m.liveFrameMs)),overlayFrameMedianMs:med(moving.map(m=>m.overlayFrameMs)),overlayFrameMaxMs:max(moving.map(m=>m.overlayFrameMs)),livePrepareMedianMs:med(moving.map(m=>m.livePrepareMs))};
const report={issue:38,stage:'D1c',status:failures.length?'FAILED':'PASSED',quick,failures,note:'PROTOTYPE. Development drawing over the live frames; nothing is saved and the live game does not load src/fauna.',
 years:YEARS,fps:FPS,seconds:SECONDS,performance:perf,worlds:worlds.map(w=>({biome:w.biome,seed:w.seed})),scenes,moving,seasons,files};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');

const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
const SITE={'river-bank':'川辺','hill-side':'丘陵','coast-inlet':'入り江'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const anim=(n,frames,scale)=>`<div class="anim" style="width:${320*scale}px;height:${180*scale}px;background-image:url(${n}.png);background-size:${320*scale}px ${180*scale*frames}px;--end:-${180*scale*frames}px;animation-timing-function:steps(${frames})"></div>`;
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 38 D1c 実景観の統合比較</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}img,.anim{display:block;image-rendering:pixelated}
.anim{background-repeat:no-repeat;animation:play ${SECONDS}s infinite}@keyframes play{from{background-position:0 0}to{background-position:0 var(--end)}}@media (prefers-reduced-motion:reduce){.anim{animation:none}}
.row{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0}figcaption{font-size:12px;max-width:640px}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #c8ccc0;padding:2px 6px}</style>
<main><h1>Issue #38 D1c｜実景観での統合比較</h1><p><b>PROTOTYPE。</b>本編の静止画・動く景観の上に、D1bの出現計画とD1cの短い動作で動物を重ねた開発用の比較。本編の画面は変わらない。検査：${failures.length?`<b>${failures.length}件の失敗</b>`:'すべて合格'}。</p>
<h2>1. 動く景観（${SECONDS}秒、${FPS}fps、2倍）</h2>${moving.map(m=>`<figure>${anim(m.name,m.frames,2)}<figcaption>${LABEL[m.world]} ${SITE[m.siteId]} ${m.year}年${m.mirror?'（鏡像）':''}：${esc(m.kinds.join('、')||'なし')}</figcaption></figure>`).join('')}
<h2>2. 静止画（0秒、2倍。左が本編、右が動物を重ねたもの）</h2>${scenes.map(s=>`<div class="row"><figure><img src="${s.name}_plain.png" width="640" height="360" loading="lazy"></figure><figure><img src="${s.name}.png" width="640" height="360" loading="lazy"><figcaption>${LABEL[s.world]} ${SITE[s.siteId]} ${s.year}年（人口${s.population}${s.mirror?'、鏡像':''}、季節の位相${s.season}）：${esc(s.kinds.join('、')||'なし')}／植物に隠れた画素${s.stats.hiddenByPlants}・建物に隠れた画素${s.stats.hiddenByStructures}</figcaption></figure></div>`).join('')}
<h2>3. 季節の4位相（開発用の入力）</h2>${[...new Set(seasons.map(s=>s.world+s.year+s.site))].map(k=>`<div class="row">${seasons.filter(s=>s.world+s.year+s.site===k).map(s=>`<figure><img src="${s.name}.png" width="640" height="360" loading="lazy"><figcaption>${LABEL[s.world]} ${s.year}年 位相${s.phase}</figcaption></figure>`).join('')}</div>`).join('')}
<h2>4. 性能（ブラウザ、ms）</h2><table>${Object.entries(perf).map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
</main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue38-d1c',status:report.status,failures:failures.length,stills:scenes.length,moving:moving.length,performance:perf,out}));
if(failures.length)process.exitCode=1;
