/**
 * Issue #38 D3: acceptance audit of the animals in the live game (D0 §11, §12 必須の自動検証, §13 D3).
 *
 *   npm run build && node scripts/audit-issue38-d3.mjs   →  artifacts/fauna38-d3/{report.json,gallery.html,*.png}
 *   Env: CHROMIUM_PATH, D3_PORT, FAUNA_D3_QUICK=1 (3 worlds, up to year 1500: CI).
 *
 * Node — each world advanced in one go to the last audited year, and in steps through every audited year (planning the
 * animals of all 3 sites at each step, as a viewer would), each step saved and restored. At every audited year and site:
 *  - the plan and the motion loops agree across the one-go, stepped and restored worlds (the stepped world knows no
 *    later history, so a later year never changes an earlier one);
 *  - every planned body fits that year's land or water off every standing plot (both facings), and every frame of every
 *    loop fits at its own facing; flying birds stay in the sky; no kind outside the wild kinds appears;
 *  - planning while advancing leaves the history unchanged: the stepped world's save equals the one-go save;
 *  - observing and planning leave the save unchanged, and the save stores no fauna.
 * Browser (Chromium) — pixels of the live still image agree across one-go / stepped-restored worlds and site switching;
 * the live still equals the frame without animals plus the animals; the moving view's second 0 shows the still's
 * animals; a forced season changes no animal; drawing times with and without animals. Images for the Human review.
 * Exits 1 when a check fails.
 */
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldStructurePainter,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {faunaSceneOf,faunaHabitatInput} from '../dist/fauna/fauna-overlay-v1.js';
import {faunaBodyFits} from '../dist/fauna/fauna-habitat-v1.js';
import {faunaMotionAt,FAUNA_GROUP,FAUNA_KINDS} from '../dist/fauna/fauna-sprites-v1.js';
import {FAUNA_LOOP_SECONDS} from '../dist/fauna/fauna-scene-v1.js';

const out='artifacts/fauna38-d3',quick=process.env.FAUNA_D3_QUICK==='1';
const YEARS=quick?[600,1000,1500]:[1000,2500,5000,7500,10000];
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=40)console.error('FAIL',m);}return ok;};
const firstSeed=(b,after=0)=>{for(let s=after+1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}throw Error('no seed');};
const cases=quick?['temperate_forest','tropical_rainforest','tundra'].map(b=>({id:b,seed:firstSeed(b)}))
 :[...BIOME_KINDS.map(b=>({id:b,seed:firstSeed(b)})),{id:'temperate_forest-2',seed:firstSeed('temperate_forest',6)},{id:'boreal_forest-2',seed:firstSeed('boreal_forest',18)}];
const WILD=new Set(FAUNA_KINDS);

/** The plan and loops of a site in a year (record coordinates), and the checks every one of them must pass. */
function look(session,year,i,label){
 const o=observeGeneratedWorldSession(session,year,i),painter=worldStructurePainter(session),scene=faunaSceneOf(o,painter);
 if(!check(scene!==null,`${label}: no plan (the world has no flora)`))return {json:'null',animals:0,kinds:{},population:o.composition.population};
 const input=faunaHabitatInput(o,painter);
 for(const g of scene.plan.groups)for(const m of g.members){
  check(WILD.has(m.kind),`${label}: unknown kind ${m.kind}`);
  check(faunaBodyFits(input,m.kind,m.size,m.pose,m.x,m.y),`${label}: ${m.kind} at ${m.x},${m.y} does not fit`);
 }
 for(const l of scene.loops){
  const flying=FAUNA_GROUP[l.kind]==='flying-bird';
  for(let k=0;k<FAUNA_LOOP_SECONDS*12;k++){
   const s=faunaMotionAt(l.kind,l.segments,(k/12+l.phase)%FAUNA_LOOP_SECONDS);if(!s)continue;
   if(flying)check(l.y+s.dy<60,`${label}: ${l.kind} below the sky floor`);
   else check(faunaBodyFits(input,l.kind,l.size,s.pose,l.x+s.dx,l.y+s.dy,s.frame,0,s.facing),`${label}: ${l.kind} ${s.pose} off its ground at ${(k/12).toFixed(2)}s`);
  }
 }
 const kinds={};for(const g of scene.plan.groups)kinds[g.kind]=(kinds[g.kind]??0)+g.members.length;
 return {json:JSON.stringify([scene.plan,scene.loops]),animals:scene.plan.groups.reduce((s,g)=>s+g.members.length,0),kinds,population:o.composition.population,held:scene.loops.filter(l=>l.segments.length===1).length};
}

const worlds=[],coverage=[];
for(const c of cases){
 const t0=Date.now(),created=(await createNewArchitectureWorld(c.seed)).architecture,chain=[];
 // stepped: advance to each audited year, planning all 3 sites at every step (a viewer watching while it advances)
 let prev=created,prevYear=0;
 for(const y of YEARS){prev=await advanceArchitectureWorld(prev,y-prevYear,'automatic');prevYear=y;chain.push(prev);const s=architectureProductionSession(prev);for(let i=0;i<3;i++)look(s,y,i,`${c.id} stepped-view ${y}/${i}`);}
 const batch=architectureProductionSession(await advanceArchitectureWorld(created,YEARS.at(-1),'automatic'));
 const before=JSON.stringify(await prepareWorldSessionSave(batch)),saves=[],shots=[];
 for(const [k,y] of YEARS.entries()){
  const S=architectureProductionSession(chain[k]),json=(await encodeWorldSave(await prepareWorldSessionSave(S))).json,R=restoreWorldSession(await decodeWorldSave(json));saves.push(json);
  const sites=[];
  for(let i=0;i<3;i++){
   const label=`${c.id} ${y}/${i}`,B=look(batch,y,i,label),St=look(S,y,i,label+' stepped'),Re=look(R,y,i,label+' restored');
   check(B.json===St.json&&St.json===Re.json,`${label}: the animals differ between one-go, stepped and restored worlds`);
   coverage.push({world:c.id,year:y,site:i,animals:B.animals,kinds:B.kinds,population:B.population,held:B.held});sites.push({site:i,animals:B.animals});
  }
  shots.push(sites.sort((a,b)=>b.animals-a.animals||a.site-b.site)[0].site);
 }
 const after=JSON.stringify(await prepareWorldSessionSave(batch));
 check(before===after,`${c.id}: observing and planning changed the save`);
 check(!/fauna/.test(after),`${c.id}: the save stores fauna`);
 check(after===JSON.stringify(await prepareWorldSessionSave(architectureProductionSession(chain.at(-1)))),`${c.id}: one-go and stepped (planning while advancing) saves differ`);
 worlds.push({...c,batchJson:(await encodeWorldSave(await prepareWorldSessionSave(batch))).json,saves,shots});
 console.log(c.id,'seed',c.seed,Math.round((Date.now()-t0)/1000)+'s');
}

const PORT=Number(process.env.D3_PORT??5398);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const pixels=[],timing=[],images=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(1800000);
 await page.route('**/__d3__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>D3</title>'}));
 await page.goto(`http://127.0.0.1:${PORT}/__d3__`);
 for(const w of worlds){
  const r=await page.evaluate(async({batchJson,saves,years,shots})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),M=await import('/scene/motion-frame.js');
   const D=await import('/scene/draw-generated-review.js'),V=await import('/season/season-presentation-v1.js'),O=await import('/fauna/fauna-overlay-v1.js'),Sc=await import('/fauna/fauna-scene-v1.js');
   const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;return c;};
   const url=c=>c.toDataURL('image/png');
   const batch=S.restoreWorldSession(await decodeWorldSave(batchJson)),painter=S.worldStructurePainter(batch),bare={...painter,fauna:undefined,faunaKey:undefined},rows=[],out=[],times=[];
   const draw=(s,y,i)=>{const c=canvas();const a=performance.now();S.drawWorldSession(c,s,y,i);return {url:url(c),ms:performance.now()-a};};
   for(const [k,y] of years.entries()){
    const step=S.restoreWorldSession(await decodeWorldSave(saves[k]));
    const first=[0,1,2].map(i=>draw(batch,y,i));
    for(let i=0;i<3;i++)rows.push({year:y,site:i,check:'stepped-restored',same:first[i].url===draw(step,y,i).url});
    const again=[2,0,1].map(i=>draw(batch,y,i).url);rows.push({year:y,site:'switch',check:'site switching',same:again[0]===first[2].url&&again[1]===first[0].url&&again[2]===first[1].url});
    for(let i=0;i<3;i++){
     // drawing times, each from its own fresh observation (no cache shared between the two), bare first
     const o=S.observeGeneratedWorldSession(batch,y,i),c=canvas();let a=performance.now();D.drawGeneratedSceneReview(c,o,undefined,undefined,bare);const bareMs=performance.now()-a;
     const oLive=S.observeGeneratedWorldSession(batch,y,i);a=performance.now();D.drawGeneratedSceneReview(canvas(),oLive,undefined,undefined,painter);const liveMs=performance.now()-a;
     O.prepareFaunaOverlay(o,painter).draw(c,0,false);
     rows.push({year:y,site:i,check:'live = frame + animals',same:url(c)===first[i].url});
     // a forced season (development input) changes no animal
     const key=painter.faunaKey(o);for(const p of [0,1,2,3]){const sp={...painter,flora:x=>({...painter.flora(x),season:V.seasonalViewOf(p,batch.climate)})};if(sp.faunaKey(S.observeGeneratedWorldSession(batch,y,i))!==key){rows.push({year:y,site:i,check:`season ${p} changes the animals`,same:false});}}
     times.push({year:y,site:i,stillMs:liveMs,stillBareMs:bareMs});
    }
    // the moving view of the busiest site: its second 0 shows the still's animals; preparation and frame times
    const si=shots[k],o=S.observeGeneratedWorldSession(batch,y,si);
    let a=performance.now();M.prepareSceneMotion(S.observeGeneratedWorldSession(batch,y,si),bare);const prepareBareMs=performance.now()-a;
    a=performance.now();const moving=M.prepareSceneMotion(o,painter);const prepareMs=performance.now()-a;
    const scene=O.faunaSceneOf(S.observeGeneratedWorldSession(batch,y,si),painter);
    rows.push({year:y,site:si,check:'moving second 0 = still',same:JSON.stringify(moving.fauna?.at?.(0)??[])===JSON.stringify(scene?Sc.faunaSceneAt(scene.loops,0):[])});
    let frameMs=0;for(let f=0;f<24;f++){const c=canvas();a=performance.now();M.drawSceneMotion(c,moving,f/12);frameMs+=performance.now()-a;}
    times.push({year:y,site:si,prepareMs,prepareBareMs,frameMs:frameMs/24});
    out.push({year:y,site:si,png:first[si].url});
   }
   return {rows,out,times};
  },{batchJson:w.batchJson,saves:w.saves,years:YEARS,shots:w.shots});
  for(const row of r.rows)check(row.same,`${w.id} year ${row.year} site ${row.site}: ${row.check} differs`);
  pixels.push({world:w.id,checks:r.rows.length,same:r.rows.filter(x=>x.same).length});
  timing.push(...r.times.map(t=>({world:w.id,...t})));
  for(const s of r.out)images.push({name:`${w.id}_y${s.year}_site${s.site}`,world:w.id,...s});
  console.log(w.id,'pixels',r.rows.filter(x=>x.same).length+'/'+r.rows.length);
 }
}finally{await browser?.close();server.kill();}

const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?Math.round(s[Math.floor(s.length/2)]*10)/10:0;},max=a=>a.length?Math.round(Math.max(...a)*10)/10:0;
const pick=k=>timing.filter(t=>t[k]!==undefined).map(t=>t[k]);
const perf={stillMedianMs:med(pick('stillMs')),stillBareMedianMs:med(pick('stillBareMs')),stillMaxMs:max(pick('stillMs')),movingPrepareMedianMs:med(pick('prepareMs')),movingPrepareBareMedianMs:med(pick('prepareBareMs')),frameMedianMs:med(pick('frameMs')),frameMaxMs:max(pick('frameMs'))};
const assets=[];for(const im of images){const raw=Buffer.from(im.png.slice(im.png.indexOf(',')+1),'base64');await writeFile(`${out}/${im.name}.png`,raw);assets.push({name:im.name,world:im.world,year:im.year,site:im.site,sha256:createHash('sha256').update(raw).digest('hex')});}
const total=k=>coverage.reduce((s,x)=>s+x[k],0),kinds={};for(const c of coverage)for(const [k,n] of Object.entries(c.kinds))kinds[k]=(kinds[k]??0)+n;
const report={issue:38,stage:'D3',status:failures.length?'FAILED':'PASSED',quick,years:YEARS,failures,worlds:worlds.map(w=>({id:w.id,seed:w.seed})),
 coverage:{scenes:coverage.length,animals:total('animals'),held:total('held'),emptyScenes:coverage.filter(c=>!c.animals).length,kinds},perScene:coverage,pixels,performance:perf,timing,assets};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const SITE=['川辺','丘陵','入り江'];
await writeFile(`${out}/gallery.html`,`<!doctype html><meta charset="utf-8"><title>Issue 38 D3</title><style>body{font:14px system-ui;margin:20px;background:#eceee8}img{image-rendering:pixelated}td{vertical-align:top;font-size:12px}</style><h1>Issue #38 D3 ${report.status}</h1><p>${failures.length} failures</p>
<table>${worlds.map(w=>`<tr><th>${w.id}<br>seed ${w.seed}</th>${assets.filter(a=>a.world===w.id).map(a=>{const c=coverage.find(x=>x.world===w.id&&x.year===a.year&&x.site===a.site);return `<td><img src="${a.name}.png" width="640" height="360"><br>${a.year}年 ${SITE[a.site]}：${Object.entries(c.kinds).map(([k,n])=>k+'×'+n).join('、')||'なし'}</td>`;}).join('')}</tr>`).join('')}</table>`);
console.log(JSON.stringify({type:'issue38-d3',status:report.status,failures:failures.length,coverage:{scenes:report.coverage.scenes,animals:report.coverage.animals,empty:report.coverage.emptyScenes},performance:perf,out}));
if(failures.length)process.exitCode=1;
