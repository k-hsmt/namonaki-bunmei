/**
 * Issue #37 D4: acceptance audit of ruin weathering (D2) and reclamation (D3) in the live game (D0 §10–11).
 *
 *   npm run build && node scripts/audit-issue37-d4.mjs   →  artifacts/ruin37-d4/{report.json,gallery.html,*.png}
 *
 * Node: each world advanced in one go and in steps to every audited year, saved and restored. At every audited year and
 * site the weathering clocks of every building and the reclaimed plants agree across the three (the stepped world knows
 * no later history, so this also shows a later year never changes an earlier one); every reclaimed root stands on an
 * open zone, off every structure plan and away from standing plots; observing leaves the save unchanged and stores nothing.
 * Browser (Chromium): pixels agree across one-go / stepped-restored worlds and site switching; the moving view's layers
 * equal the static frame on structure pixels, still and swaying; drawing and preparation times. Images for the Human
 * landscape review. Exits 1 when a check fails. Env: CHROMIUM_PATH, D4_PORT, D4_QUICK=1 (3 worlds, up to year 1500).
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldStructurePainter,prepareWorldSessionSave,restoreWorldSession,worldRuinContext} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {planFloraScene} from '../dist/flora/flora-scene-v1.js';
import {sceneOccupiedPlots} from '../dist/scene/flora-draw.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {ruinClocksAt} from '../dist/ruin/ruin-history-v1.js';
import {reclamationOwners} from '../dist/ruin/reclamation-scene-v1.js';
import {reclamationPeriods,openZonesAt,reclamationMask,RECLAMATION_PARAMETERS} from '../dist/ruin/reclamation-access-v1.js';

const out='artifacts/ruin37-d4',quick=process.env.D4_QUICK==='1';
const YEARS=quick?[600,1000,1500]:[1000,2500,5000,7500,10000];
await mkdir(out,{recursive:true});
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const firstSeed=(b,after=0)=>{for(let s=after+1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}};
const cases=quick?['temperate_forest','desert','tropical_rainforest'].map(b=>({id:b,seed:firstSeed(b)})):[...BIOME_KINDS.map(b=>({id:b,seed:firstSeed(b)})),{id:'temperate_forest-2',seed:firstSeed('temperate_forest',6)},{id:'boreal_forest-2',seed:firstSeed('boreal_forest',18)}];
const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.depth===b.depth;

/** Clocks of every building of an observation, and its reclaimed plants with the live planting they join. */
function look(session,year,site){
 const o=observeGeneratedWorldSession(session,year,site),painter=worldStructurePainter(session),f=painter.flora(o),t=worldRuinContext(session.architecture).timelines;
 const clocks=[...o.composition.residentialBlocks.map(b=>['housing',b.blockId,ruinClocksAt(t.housing.get(b.blockId),year,'housing')]),
  ...o.snapshot.objects.filter(x=>x.kind!=='field'&&x.kind!=='bridge').map(x=>['facility',x.id,ruinClocksAt(t.facilities.get(x.id),year,'facility')])];
 const physics=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),occupied=sceneOccupiedPlots(o);
 const planted=planFloraScene({seed:f.seed,site:o.ground.site,patches:f.patches,views:f.views,physics,occupied}),reclaimed=f.reclaim(planted);
 return {o,t,clocks,physics,occupied,planted,reclaimed};
}
/** Every reclaimed root on an open zone of its owner, off every structure plan, away from standing plots. */
function rootsValid(L,year,label){
 const owners=reclamationOwners(L.o,L.t),open=owners.filter(w=>openZonesAt(reclamationPeriods(w),year).length);
 const standing=L.occupied.filter(p=>!open.some(w=>same(w.footprint,p))),A=RECLAMATION_PARAMETERS.apron,c=RECLAMATION_PARAMETERS.clearance;
 const masks=open.map(w=>({mask:reclamationMask(w,L.physics,standing),zones:new Set(openZonesAt(reclamationPeriods(w),year).map(z=>z.zone))}));
 let bad=0;
 for(const p of L.reclaimed){
  const cells=[[0,0],[1,0],[0,1],[1,1]].map(([dx,dy])=>[p.x+dx,p.y+dy]);
  const onZone=masks.some(({mask,zones})=>cells.every(([x,y])=>{const v=mask[y*320+x];return v===1&&zones.has('perimeter')||v===2&&zones.has('exposed-interior');}));
  const onPlan=owners.some(w=>w.protectedPlans.some(q=>cells.some(([x,y])=>x>=q.x-c&&x<q.x+q.width+c&&y>=q.y-c&&y<q.y+q.depth+c)));
  const byStanding=standing.some(s=>cells.some(([x,y])=>x>=s.x-A&&x<s.x+s.width+A&&y>=s.y-A&&y<s.y+s.depth+A));
  if(!onZone||onPlan||byStanding)bad++;
 }
 check(bad===0,`${label}: ${bad} reclaimed roots off their zones or on structures`);
 return {open:open.length,owners:owners.length};
}

const worlds=[],coverage=[];
for(const c of cases){
 const t0=Date.now(),created=(await createNewArchitectureWorld(c.seed)).architecture,chain=[];
 let prev=created,prevYear=0;for(const y of YEARS){prev=await advanceArchitectureWorld(prev,y-prevYear,'automatic');prevYear=y;chain.push(prev);}
 const batch=architectureProductionSession(await advanceArchitectureWorld(created,YEARS.at(-1),'automatic'));
 const before=JSON.stringify(await prepareWorldSessionSave(batch)),saves=[],sites=[];
 for(const [k,y] of YEARS.entries()){
  const S=architectureProductionSession(chain[k]),json=(await encodeWorldSave(await prepareWorldSessionSave(S))).json,R=restoreWorldSession(await decodeWorldSave(json));saves.push(json);
  for(let i=0;i<3;i++){
   const label=`${c.id} ${y}/${i}`,B=look(batch,y,i),St=look(S,y,i),Re=look(R,y,i);
   check(JSON.stringify(B.clocks)===JSON.stringify(St.clocks)&&JSON.stringify(St.clocks)===JSON.stringify(Re.clocks),`${label}: weathering clocks differ between one-go, stepped and restored worlds`);
   check(JSON.stringify(B.reclaimed)===JSON.stringify(St.reclaimed)&&JSON.stringify(St.reclaimed)===JSON.stringify(Re.reclaimed),`${label}: reclaimed plants differ between one-go, stepped and restored worlds`);
   check(JSON.stringify(B.planted)===JSON.stringify(Re.planted),`${label}: the live planting differs`);
   const z=rootsValid(B,y,label);
   const weathered=B.clocks.filter(x=>x[2].abandonedYears!==null).length,ruined=B.clocks.filter(x=>x[2].ruinedYears!==null).length;
   coverage.push({world:c.id,year:y,site:i,buildings:B.clocks.length,weathered,ruined,openOwners:z.open,reclaimed:B.reclaimed.length,planted:B.planted.length});
   sites.push({year:y,site:i,weathered,ruined,reclaimed:B.reclaimed.length});
  }
 }
 const after=JSON.stringify(await prepareWorldSessionSave(batch));
 check(before===after,`${c.id}: observing changed the save`);
 check(!/ruin-weathering|ruin-history|reclamation/.test(after),`${c.id}: the save stores weathering or reclamation`);
 check(after===JSON.stringify(await prepareWorldSessionSave(architectureProductionSession(chain.at(-1)))),`${c.id}: one-go and stepped saves differ`);
 // the gallery shows, per audited year, the site with the most weathered buildings
 const shots=YEARS.map(y=>sites.filter(s=>s.year===y).sort((a,b)=>b.weathered+b.reclaimed-a.weathered-a.reclaimed||a.site-b.site)[0]);
 worlds.push({...c,batchJson:(await encodeWorldSave(await prepareWorldSessionSave(batch))).json,saves,shots});
 console.log(c.id,'seed',c.seed,Math.round((Date.now()-t0)/1000)+'s');
}
const sum=k=>coverage.reduce((s,x)=>s+x[k],0);
check(sum('ruined')>0&&sum('reclaimed')>0,'the audit saw no ruin or no reclaimed plant');

const PORT=Number(process.env.D4_PORT??5397);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const pixels=[],timing=[],images=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(1800000);
 await page.route('**/__d4__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>D4</title>'}));
 await page.goto(`http://127.0.0.1:${PORT}/__d4__`);
 for(const w of worlds){
  const r=await page.evaluate(async({batchJson,saves,years,shots})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),M=await import('/scene/motion-frame.js');
   const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;return c;};
   const draw=(s,y,i)=>{const c=canvas();const a=performance.now();S.drawWorldSession(c,s,y,i);return {url:c.toDataURL('image/png'),ms:performance.now()-a,c};};
   const px=c=>c.getContext('2d').getImageData(0,0,320,180).data;
   const batch=S.restoreWorldSession(await decodeWorldSave(batchJson)),painter=S.worldStructurePainter(batch),rows=[],out=[],times=[];
   for(const [k,y] of years.entries()){
    const step=S.restoreWorldSession(await decodeWorldSave(saves[k]));
    const first=[0,1,2].map(i=>draw(batch,y,i));
    for(let i=0;i<3;i++){rows.push({year:y,site:i,check:'stepped',same:first[i].url===draw(step,y,i).url});times.push({year:y,site:i,drawMs:first[i].ms});}
    const again=[2,0,1].map(i=>draw(batch,y,i).url);rows.push({year:y,site:'switch',check:'switch',same:again[0]===first[2].url&&again[1]===first[0].url&&again[2]===first[1].url});
    // moving view: its layers composed still and at two poses equal the static frame on structure pixels
    const shot=shots[k],si=shot.site,o=S.observeGeneratedWorldSession(batch,y,si);let a=performance.now();const moving=M.prepareSceneMotion(o,painter);const prepareMs=performance.now()-a;
    M.drawSceneMotion(canvas(),moving,0);
    const st=px(moving.structures),fr=px(first[si].c);
    const composite=seconds=>{moving.flora.at(seconds);const c=canvas(),g=c.getContext('2d');g.drawImage(moving.backdrop,0,0);g.drawImage(moving.flora.behind,0,0);g.drawImage(moving.structures,0,0);g.drawImage(moving.flora.front,0,0);return px(c);};
    const still=composite(undefined);let differ=0;for(let i=0;i<57600;i++)if(st[i*4+3]&&(still[i*4]!==fr[i*4]||still[i*4+1]!==fr[i*4+1]||still[i*4+2]!==fr[i*4+2]))differ++;
    rows.push({year:y,site:si,check:'moving-still',same:differ===0,differ});
    composite(1.7);composite(4.2);moving.flora.at(undefined);const back=composite(undefined);let redo=0;for(let i=0;i<still.length;i++)if(back[i]!==still[i])redo++;
    rows.push({year:y,site:si,check:'moving-return',same:redo===0});
    times.push({year:y,site:si,prepareMs});
    out.push({year:y,site:si,png:first[si].url});
   }
   return {rows,out,times};
  },{batchJson:w.batchJson,saves:w.saves,years:YEARS,shots:w.shots});
  for(const row of r.rows)check(row.same,`${w.id} year ${row.year} site ${row.site}: ${row.check} differs${row.differ?` (${row.differ} px)`:''}`);
  pixels.push({world:w.id,checks:r.rows.length,same:r.rows.filter(x=>x.same).length});
  timing.push(...r.times.map(t=>({world:w.id,...t})));
  for(const s of r.out)images.push({name:`${w.id}_y${s.year}_site${s.site}`,world:w.id,...s});
  console.log(w.id,'pixels',r.rows.filter(x=>x.same).length+'/'+r.rows.length);
 }
}finally{await browser?.close();server.kill();}

const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?Math.round(s[Math.floor(s.length/2)]*10)/10:0;},max=a=>a.length?Math.round(Math.max(...a)*10)/10:0;
const draws=timing.filter(t=>t.drawMs!==undefined).map(t=>t.drawMs),preps=timing.filter(t=>t.prepareMs!==undefined).map(t=>t.prepareMs);
const perf={drawMedianMs:med(draws),drawMaxMs:max(draws),prepareMedianMs:med(preps),prepareMaxMs:max(preps)};
const assets=[];for(const im of images){const raw=Buffer.from(im.png.slice(im.png.indexOf(',')+1),'base64');await writeFile(`${out}/${im.name}.png`,raw);assets.push({name:im.name,world:im.world,year:im.year,site:im.site,sha256:createHash('sha256').update(raw).digest('hex')});}
const report={issue:37,stage:'D4',status:failures.length?'FAILED':'PASSED',quick,years:YEARS,failures,worlds:worlds.map(w=>({id:w.id,seed:w.seed})),
 coverage:{ruined:sum('ruined'),weathered:sum('weathered'),reclaimed:sum('reclaimed'),scenes:coverage.length},perScene:coverage,pixels,performance:perf,timing,assets};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const SITE=['川辺','丘陵','入り江'];
await writeFile(`${out}/gallery.html`,`<!doctype html><meta charset="utf-8"><title>Issue 37 D4</title><style>body{font:14px system-ui;margin:20px;background:#eceee8}img{image-rendering:pixelated}td{vertical-align:top;font-size:12px}</style><h1>Issue #37 D4 ${report.status}</h1>
<table>${worlds.map(w=>`<tr><th>${w.id}<br>seed ${w.seed}</th>${assets.filter(a=>a.world===w.id).map(a=>`<td><img src="${a.name}.png" width="640" height="360"><br>${a.year}年 ${SITE[a.site]}</td>`).join('')}</tr>`).join('')}</table>`);
console.log(JSON.stringify({type:'issue37-d4',status:report.status,failures:failures.length,coverage:report.coverage,performance:perf,out}));
if(failures.length)process.exitCode=1;
