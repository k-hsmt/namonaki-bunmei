/**
 * Issue #36 D1c PROTOTYPE: how the scene changes when years are confirmed, at each auto-advance speed.
 *
 *   npm run build && node scripts/preview-season-d1c.mjs  →  artifacts/season36-d1c/{report.json,*.webm,gallery.html}
 *
 * Years: a real world advanced with the game's own step (advanceWorldSessionAsync: up to 36 years, stopping at a new
 * record), so the season phase (year mod 4) jumps the way it would in play. Frames are drawn beforehand from the final
 * world (past observation equals the live view), then replayed in real time in Chromium and recorded:
 * - slow (2100 ms) and normal (850 ms): immediate, or a 150/250/350 ms blend from the new year in the previous phase
 *   to the new year in its own phase (never a blend with the previous year's buildings: D0 §7);
 * - fast (250 ms) and rapid (75 ms): every step drawn (as today), or redraws limited to one every 700/1400 ms (alone or
 *   with a 250/350 ms blend from the previously shown phase) showing
 *   only the latest confirmed year (D0 §7: no queue, latest complete scene; stop shows the last confirmed year).
 * Metrics: scene changes per second and the mean absolute luminance change per change (a flash measure).
 * Drawing cost is not part of the replay; it is measured separately (preparation per year). Development only.
 */
import {mkdir,writeFile,readdir,rename,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {architectureProductionSession,advanceWorldSessionAsync,chooseWorldSessionAsync,prepareWorldSessionSave} from '../dist/story/world-session.js';
import {encodeWorldSave} from '../dist/story/world-storage.js';
import {lastObservedYear} from '../dist/story/engine.js';

const out='artifacts/season36-d1c',YEARS_NEEDED=Number(process.env.SEASON_D1C_YEARS??120),SECONDS=Number(process.env.SEASON_D1C_SECONDS??8);
await rm(out,{recursive:true,force:true});await mkdir(out+'/video',{recursive:true});
const firstSeed=b=>{for(let s=1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}};
const SPEEDS={slow:2100,normal:850,fast:250,rapid:75};
const POLICIES=[
 ...['slow','normal'].flatMap(speed=>[0,150,250,350].map(t=>({speed,mode:'blend',ms:0,blend:t,label:t?`遷移${t}ms`:'遷移なし'}))),
 ...['fast','rapid'].flatMap(speed=>[[0,0],[700,0],[1400,0],[700,250],[1400,350]].map(([ms,blend])=>({speed,mode:'throttle',ms,blend,label:(ms?`${ms}msごとに更新`:'毎回描き直す（現状）')+(blend?`＋遷移${blend}ms`:'')}))),
];
const worlds=[];
for(const biome of ['temperate_forest','boreal_forest']){
 const seed=firstSeed(biome);let s=architectureProductionSession((await createNewArchitectureWorld(seed)).architecture);const years=[0];
 // Pending choices are resolved at random, as the game's auto choice does during auto-advance.
 while(years.length<YEARS_NEEDED){s=s.state.pending?await chooseWorldSessionAsync(s,'random'):await advanceWorldSessionAsync(s);const y=lastObservedYear(s.state);if(y>years.at(-1))years.push(y);}
 worlds.push({biome,seed,years,json:(await encodeWorldSave(await prepareWorldSessionSave(s))).json});
 console.log(biome,seed,'years',years.slice(0,12).join(','),'…',years.at(-1));
}
const PORT=Number(process.env.SEASON_D1C_PORT??5381);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const runs=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 for(const w of worlds){
  // Draw every year in all 4 phases (its own, and any phase a blend may start from).
  const prep=await browser.newPage();prep.setDefaultTimeout(1800000);
  await prep.route('**/__d1c__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>d1c</title>'}));
  await prep.goto(`http://127.0.0.1:${PORT}/__d1c__`);
  const frames=await prep.evaluate(async({json,years})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),D=await import('/scene/draw-generated-review.js'),V=await import('/season/season-presentation-v1.js');
   const session=S.restoreWorldSession(await decodeWorldSave(json)),painter=S.worldStructurePainter(session),out=[],times=[];
   const draw=(y,phase)=>{const o=S.observeGeneratedWorldSession(session,y,0),c=document.createElement('canvas');D.drawGeneratedSceneReview(c,o,undefined,undefined,{...painter,flora:x=>({...painter.flora(x),season:V.seasonalViewOf(phase,session.climate)})});return c.toDataURL('image/png');};
   for(let k=0;k<years.length;k++){const y=years[k],t=performance.now(),own=draw(y,y%4);times.push(performance.now()-t);const phases=[0,1,2,3].map(p=>p===y%4?own:draw(y,p));out.push({year:y,phases});}
   return {frames:out,prepareMs:times};
  },{json:w.json,years:w.years});
  await prep.close();
  for(const p of POLICIES){
   const ctx=await browser.newContext({viewport:{width:660,height:420},recordVideo:{dir:out+'/video',size:{width:660,height:420}}});
   const page=await ctx.newPage();page.setDefaultTimeout(600000);
   await page.route('**/__d1c__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>d1c</title><body style="margin:0;background:#20251f;color:#e9ede5;font:16px system-ui"><div id="label" style="padding:8px 10px"></div><canvas id="c" width="320" height="180" style="width:640px;height:360px;image-rendering:pixelated;margin:0 10px"></canvas></body>'}));
   await page.goto(`http://127.0.0.1:${PORT}/__d1c__`);
   const metrics=await page.evaluate(async({frames,interval,policy,seconds,title})=>{
    const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
    const ph=await Promise.all(frames.map(f=>Promise.all(f.phases.map(load)))),own=ph.map((p,k)=>p[frames[k].year%4]);
    const c=document.getElementById('c'),g=c.getContext('2d'),label=document.getElementById('label');g.imageSmoothingEnabled=false;
    const probe=document.createElement('canvas');probe.width=80;probe.height=45;const pg=probe.getContext('2d',{willReadFrequently:true});
    const lum=()=>{pg.drawImage(c,0,0,80,45);const d=pg.getImageData(0,0,80,45).data,l=new Float32Array(3600);for(let i=0;i<3600;i++)l[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];return l;};
    let last=null,changes=0,flash=0,maxFlash=0;const sample=()=>{const l=lum();if(last){let s=0;for(let i=0;i<l.length;i++)s+=Math.abs(l[i]-last[i]);s/=l.length;if(s>.5){changes++;flash+=s;maxFlash=Math.max(maxFlash,s);}}last=l;};
    const show=(k,img)=>{g.globalAlpha=1;g.drawImage(img,0,0);label.textContent=`${title}｜${frames[k].year}年（位相${frames[k].year%4}）`;};
    show(0,own[0]);sample();
    const t0=performance.now();let confirmed=0,shown=0,lastDraw=t0,blend=null;
    await new Promise(done=>{const tick=now=>{
     const due=Math.min(frames.length-1,Math.floor((now-t0)/interval));
     if(due>confirmed)confirmed=due;
     // A new scene is shown when a step is due (blend: every confirmed year; throttle: at most every policy.ms).
     const ready=confirmed>shown&&(policy.mode==='blend'||now-lastDraw>=policy.ms);
     if(ready){const from=frames[shown].year%4;shown=confirmed;lastDraw=now;
      // Blend from the NEW year drawn in the previously shown phase to the new year in its own phase.
      if(policy.blend&&from!==frames[shown].year%4){blend={k:shown,from,start:now};show(shown,ph[shown][from]);}else{blend=null;show(shown,own[shown]);}}
     if(blend){const a=Math.min(1,(now-blend.start)/policy.blend);g.globalAlpha=1;g.drawImage(ph[blend.k][blend.from],0,0);g.globalAlpha=a;g.drawImage(own[blend.k],0,0);g.globalAlpha=1;if(a>=1)blend=null;}
     sample();
     if(now-t0<seconds*1000)requestAnimationFrame(tick);else{
      // Stop: the last confirmed year is shown at once (D0 §7).
      if(shown!==confirmed){shown=confirmed;show(shown,own[shown]);sample();}
      done();}
    };requestAnimationFrame(tick);});
    return {changesPerSecond:Math.round(changes/seconds*10)/10,meanFlash:changes?Math.round(flash/changes*10)/10:0,maxFlash:Math.round(maxFlash*10)/10,flashPerSecond:Math.round(flash/seconds*10)/10,yearsConfirmed:confirmed,yearsShown:shown};
   },{frames:frames.frames,interval:SPEEDS[p.speed],policy:p,seconds:SECONDS,title:`${p.speed} ${p.label}`});
   const video=page.video();await ctx.close();
   const name=`${w.biome}_${p.speed}_${p.mode}${p.ms}_b${p.blend}.webm`;await rename(await video.path(),`${out}/${name}`);
   runs.push({world:w.biome,seed:w.seed,...p,video:name,...metrics});
   console.log(w.biome,p.speed,p.label,JSON.stringify(metrics));
  }
  w.prepareMs=frames.prepareMs;
 }
}finally{await browser?.close();server.kill();}
for(const f of await readdir(out+'/video'))await rm(out+'/video/'+f);await rm(out+'/video',{recursive:true,force:true});
const med=a=>{const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.floor(s.length/2)]);};
const report={issue:36,stage:'D1c',status:'PROTOTYPE — replay of confirmed years; development only',speeds:SPEEDS,seconds:SECONDS,
 worlds:worlds.map(w=>({biome:w.biome,seed:w.seed,years:w.years,prepareMedianMs:med(w.prepareMs),prepareMaxMs:Math.round(Math.max(...w.prepareMs))})),runs};
await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({type:'issue36-d1c',runs:runs.length,out}));
