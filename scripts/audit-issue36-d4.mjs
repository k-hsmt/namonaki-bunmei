/**
 * Issue #36 D4: acceptance audit of the live seasons (D0 §9, items 5–6, and the Human landscape review).
 *
 *   npm run build && node scripts/audit-issue36-d4.mjs   →  artifacts/season36-d4/{report.json,*.png}
 *
 * Node: worlds advanced in one go and in steps to each audited year, saved and restored: the season, flora and
 * observed history agree; observing every audited year and site leaves the save unchanged and stores no season.
 * Browser (Chromium): pixels agree across one-go/stepped/restored worlds and site switching, in every phase;
 * preparation time with and without snow, and the cost of a moving frame during a season blend.
 * Exits 1 when a check fails. Env: CHROMIUM_PATH, D4_PORT, D4_QUICK=1 (3 worlds, up to year 1075).
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {seasonalViewOf,seasonPhaseOfYear,SEASON_PHASE_YEARS} from '../dist/season/season-presentation-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,worldStructurePainter,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';

const out='artifacts/season36-d4',quick=process.env.D4_QUICK==='1';
// Every phase at early and late history: years multiple of 100 are all phase 0, so 25/50/75 offsets are added.
const YEARS=quick?[0,25,50,75,1000,1025,1050,1075]:[0,25,50,75,1000,1025,1050,1075,9925,9950,9975,10000];
await mkdir(out,{recursive:true});
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const firstSeed=(b,after=0)=>{for(let s=after+1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}};
const cases=quick?['temperate_forest','boreal_forest','grassland'].map(b=>({id:b,seed:firstSeed(b)})):[...BIOME_KINDS.map(b=>({id:b,seed:firstSeed(b)})),{id:'temperate_forest-2',seed:firstSeed('temperate_forest',6)},{id:'tundra-2',seed:firstSeed('tundra',4)}];

const worlds=[];
for(const c of cases){
 const t0=Date.now(),created=(await createNewArchitectureWorld(c.seed)).architecture,chain=[created];
 for(let k=1;k<YEARS.length;k++)chain.push(await advanceArchitectureWorld(chain[k-1],YEARS[k]-YEARS[k-1],'automatic'));
 const batch=architectureProductionSession(await advanceArchitectureWorld(created,YEARS.at(-1),'automatic')),painter=worldStructurePainter(batch);
 const before=JSON.stringify(await prepareWorldSessionSave(batch)),saves=[];
 for(const [k,y] of YEARS.entries()){
  const S=architectureProductionSession(chain[k]),json=(await encodeWorldSave(await prepareWorldSessionSave(S))).json,R=restoreWorldSession(await decodeWorldSave(json));saves.push(json);
  for(let i=0;i<3;i++){
   const fB=painter.flora(observeGeneratedWorldSession(batch,y,i)),fS=worldStructurePainter(S).flora(observeGeneratedWorldSession(S,y,i)),fR=worldStructurePainter(R).flora(observeGeneratedWorldSession(R,y,i));
   check(JSON.stringify(fB.season)===JSON.stringify(seasonalViewOf(seasonPhaseOfYear(y),batch.climate)),`${c.id} ${y}/${i}: season is not the observed year's`);
   check(JSON.stringify([fB.season,fB.views])===JSON.stringify([fS.season,fS.views])&&JSON.stringify([fS.season,fS.views])===JSON.stringify([fR.season,fR.views]),`${c.id} ${y}/${i}: season or flora differ between one-go, stepped and restored worlds`);
   check(JSON.stringify(observeGeneratedWorldSession(batch,y,i).snapshot)===JSON.stringify(observeGeneratedWorldSession(S,y,i).snapshot),`${c.id} ${y}/${i}: observed history differs`);
  }
 }
 const after=JSON.stringify(await prepareWorldSessionSave(batch));
 check(before===after,`${c.id}: observing changed the save`);check(!after.includes('season'),`${c.id}: the save stores a season`);
 check(after===JSON.stringify(await prepareWorldSessionSave(architectureProductionSession(chain.at(-1)))),`${c.id}: one-go and stepped saves differ`);
 worlds.push({...c,batchJson:(await encodeWorldSave(await prepareWorldSessionSave(batch))).json,saves,views:YEARS.map(y=>({year:y,...seasonalViewOf(seasonPhaseOfYear(y),batch.climate)}))});
 console.log(c.id,'seed',c.seed,Math.round((Date.now()-t0)/1000)+'s');
}

const PORT=Number(process.env.D4_PORT??5391);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const pixels=[],timing=[],images=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(1800000);
 await page.route('**/__d4__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>D4</title>'}));
 await page.goto(`http://127.0.0.1:${PORT}/__d4__`);
 for(const w of worlds){
  const r=await page.evaluate(async({batchJson,saves,years})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),M=await import('/scene/motion-frame.js');
   const url=(s,y,i)=>{const c=document.createElement('canvas');S.drawWorldSession(c,s,y,i);return c.toDataURL('image/png');};
   const batch=S.restoreWorldSession(await decodeWorldSave(batchJson)),painter=S.worldStructurePainter(batch),rows=[],shots=[],times=[];
   for(const [k,y] of years.entries()){
    const step=S.restoreWorldSession(await decodeWorldSave(saves[k]));
    const first=[0,1,2].map(i=>url(batch,y,i));
    for(let i=0;i<3;i++)rows.push({year:y,site:i,same:first[i]===url(step,y,i)});
    const again=[2,0,1].map(i=>url(batch,y,i));rows.push({year:y,site:'switch',same:again[0]===first[2]&&again[1]===first[0]&&again[2]===first[1]});
    for(let i=0;i<2;i++)shots.push({year:y,site:i,png:first[i]});
    // Preparation of the moving view, and one blended moving frame (two scenes and a composite).
    const o=S.observeGeneratedWorldSession(batch,y,0),season=painter.flora(o).season;let a=performance.now();const prepared=M.prepareSceneMotion(o,painter);const prepare=performance.now()-a;
    const other={...painter,flora:x=>({...painter.flora(x),season:{...season,phase:(season.phase+3)%4}})};const from=M.prepareSceneMotion(o,other);
    const c=document.createElement('canvas'),t=document.createElement('canvas');a=performance.now();
    for(let n=0;n<10;n++){M.drawSceneMotion(c,prepared,n/12);M.drawSceneMotion(t,from,n/12);const g=c.getContext('2d');g.globalAlpha=.5;g.drawImage(t,0,0);g.globalAlpha=1;}
    times.push({year:y,snow:season.snow,prepareMs:Math.round(prepare),blendFrameMs:Math.round((performance.now()-a)/10*10)/10});
   }
   return {rows,shots,times};
  },{batchJson:w.batchJson,saves:w.saves,years:YEARS});
  for(const row of r.rows)check(row.same,`${w.id} year ${row.year} site ${row.site}: pixels differ`);
  pixels.push({world:w.id,checks:r.rows.length,same:r.rows.filter(x=>x.same).length});
  timing.push(...r.times.map(t=>({world:w.id,...t})));
  for(const s of r.shots)images.push({name:`${w.id}_y${s.year}_site${s.site}`,...s,world:w.id});
  console.log(w.id,'pixels',r.rows.filter(x=>x.same).length+'/'+r.rows.length);
 }
}finally{await browser?.close();server.kill();}

const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
const snowy=timing.filter(t=>t.snow>0),clear=timing.filter(t=>t.snow===0);
const performance={prepareMedianMsWithSnow:med(snowy.map(t=>t.prepareMs)),prepareMedianMsWithoutSnow:med(clear.map(t=>t.prepareMs)),prepareMaxMs:Math.max(...timing.map(t=>t.prepareMs)),
 blendFrameMedianMs:med(timing.map(t=>t.blendFrameMs)),blendFrameMaxMs:Math.max(...timing.map(t=>t.blendFrameMs))};
check(med(timing.map(t=>t.prepareMs))<=150,`median preparation ${med(timing.map(t=>t.prepareMs))} ms exceeds the 150 ms budget`);
const assets=[];for(const im of images){const raw=Buffer.from(im.png.slice(im.png.indexOf(',')+1),'base64');await writeFile(`${out}/${im.name}.png`,raw);assets.push({name:im.name,sha256:createHash('sha256').update(raw).digest('hex')});}
const report={issue:36,stage:'D4',status:failures.length?'FAILED':'PASSED',quick,phaseYears:SEASON_PHASE_YEARS,years:YEARS,failures,
 worlds:worlds.map(w=>({id:w.id,seed:w.seed,views:w.views})),pixels,performance,timing,assets};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({type:'issue36-d4',status:report.status,failures,performance,out}));
if(failures.length)process.exitCode=1;
