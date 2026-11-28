/**
 * Issue #40 D3a: trial of the food system on the episode frame (review-only), D0 §4.2 / §12 D3a.
 *
 *   npm run build && node scripts/audit-issue40-d3a.mjs   →  artifacts/history40-d3a/report.json
 *   Env: HISTORY40_D3A_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 tuning worlds to year 5000 under hardship-linked + decisions-d2b + the food system (food-d3a), branch by
 * branch, every branch left to the people (autonomous observation). Per world:
 *  - the whole typed history is rebuilt and checked every 1000 years and at the end (checkEpisodeHistory);
 *  - the episodes observed in year 2500 must be the same when read again in year 5000;
 *  - every transition is re-checked against its sources by scripts/lib/history40-food.mjs (written apart from the
 *    definition), using the chronicle, the decisions and the economy captured each year;
 *  - the first world of each biome is also run without episodes (D2b): the civilization and the architecture ledger must
 *    be the same (the food system applies no effect), and is saved at its first branch after 2500 with an active food
 *    episode, restored, and continued both ways for 500 more years.
 * Exits 1 when a check fails.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {lastObservedYear} from '../dist/story/engine.js';
import {checkEpisodeHistory,episodesAt} from '../dist/story/episode-d2c-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld,prepareReviewSave,restoreReviewSave} from '../dist/story/review-save-d2b.js';
import {MEASURE_ID,allocateSeeds,distribution} from './lib/history40-measures.mjs';
import {recheckFoodEpisodes} from './lib/history40-food.mjs';
import {FOOD_EPISODE_D3A} from '../dist/story/episode-food-d3a-review.js';

const out='artifacts/history40-d3a',quick=process.env.HISTORY40_D3A_QUICK==='1';
const HORIZON=quick?1000:5000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS,OBSERVE=quick?500:2500,SAVE_AFTER=quick?500:2500,SAVE_CONTINUE=quick?700:3000;
const POLICY='hardship-linked+decisions-d2b+episodes-food-d3a',WITHOUT='hardship-linked+decisions-d2b';
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=50)console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex'),ms=t=>Math.round(performance.now()-t);
const started=performance.now(),startedAt=new Date().toISOString();
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=BIOMES.flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed,rank})));

/** To HORIZON, branch by branch, every branch left to the people. */
async function run(c,policy,each=()=>{}){
 const captures=[];let world=await createReviewWorld(c.seed,policy);
 while(world.terrain.review.state.year<HORIZON||world.terrain.review.state.pending){
  const s0=world.terrain.review.state;
  // a branch pending in a year finishes that year when chosen: the year's checks run then
  if(s0.pending){world=await chooseReviewWorld(world,'random',{economy:cap=>captures.push(cap)});if(!world.terrain.review.state.pending&&world.terrain.review.state.year%500===0)each(world.terrain.review.state);continue;}
  const to=Math.min(HORIZON,(Math.floor(s0.year/500)+1)*500);
  world=await advanceReviewWorld(world,to-s0.year,'stop',{economy:cap=>captures.push(cap)});
  if(!world.terrain.review.state.pending)each(world.terrain.review.state);
 }
 return {world,captures};
}

function recheck(c,s,captures){for(const p of recheckFoodEpisodes(s,captures))check(false,`${c.id} ${p}`);}

function measures(s){
 const episodes=episodesAt(s,s.episodes.committedThrough),ts=s.episodes.transitions,ended=episodes.filter(e=>e.endedYear!==null);
 const count=f=>ts.filter(f).length,responded=episodes.filter(e=>e.transitions.some(t=>t.kind==='response-started'));
 const recurrences=episodes.slice(1).map((e,i)=>episodes[i].endedYear===null?null:e.startedYear-episodes[i].endedYear).filter(x=>x!==null);
 const activeYears=episodes.reduce((a,e)=>a+((e.endedYear??HORIZON)-e.startedYear),0);
 const responses={};for(const t of ts)if(t.kind==='response-started'||t.kind==='response-changed'){const k=t.kind==='response-changed'?t.reason.replace(/^to-/,''):t.reason;responses[k]=(responses[k]??0)+1;}
 const origins={shortage:0,famine:0};for(const e of episodes){const r=e.transitions[0].evidence.map(x=>s.history.find(h=>h.id===x.id));if(r.some(x=>x?.kind==='famine'))origins.famine++;if(r.some(x=>x&&/の食糧不足が続く$/.test(x.title)))origins.shortage++;}
 return {episodes:episodes.length,resolved:episodes.filter(e=>e.status==='resolved').length,abandoned:episodes.filter(e=>e.status==='abandoned').length,activeAtHorizon:episodes.length-ended.length,
  withResponse:responded.length,resolvedWithoutResponse:episodes.filter(e=>e.status==='resolved'&&!e.transitions.some(t=>t.kind.startsWith('response'))).length,
  responses,failures:count(t=>t.kind==='response-failed'),changes:count(t=>t.kind==='response-changed'),
  spread:count(t=>t.reason==='shortage-spread'),famines:count(t=>t.reason==='famine'),recovering:count(t=>t.reason==='supply-recovering'),relapses:count(t=>t.reason==='supply-relapsed'),
  origins,transitions:ts.length,firstStart:episodes[0]?.startedYear??null,durations:distribution(ended.map(e=>e.endedYear-e.startedYear)),
  longestActive:Math.max(0,...episodes.map(e=>(e.endedYear??HORIZON)-e.startedYear)),quietBeforeRecurrence:distribution(recurrences),
  activeShare:+(activeYears/HORIZON).toFixed(3),storeBytes:JSON.stringify(s.episodes).length};
}

const identity=w=>{const {episodes,...rest}=w.terrain.review.state;return sha(JSON.stringify({state:rest,architecture:w.architecture}));};

/** Save at the first branch after SAVE_AFTER with an active episode, restore, continue both SAVE_CONTINUE-SAVE_AFTER years. */
async function roundTrip(c){
 let world=await advanceReviewWorld(await createReviewWorld(c.seed,POLICY),SAVE_AFTER,'automatic');
 for(;;){
  if(world.terrain.review.state.year<HORIZON)world=await advanceReviewWorld(world,HORIZON-world.terrain.review.state.year,'stop');
  const s=world.terrain.review.state;
  if(!s.pending){check(false,`${c.id}: no branch with an active episode after ${SAVE_AFTER}`);return {status:'none'};}
  if(s.episodes.active.food)break;
  world=await chooseReviewWorld(world,'random');
 }
 const s=world.terrain.review.state;check(s.episodes.committedThrough===s.year-1,`${c.id}: the pending year is committed`);
 let t=performance.now();const save=await prepareReviewSave(world),json=JSON.stringify(save);const saveMs=ms(t);
 t=performance.now();const restored=await restoreReviewSave(JSON.parse(json));const loadMs=ms(t);
 check(JSON.stringify(restored.terrain.review.state)===JSON.stringify(s),`${c.id}: the restored world differs`);
 const to=s.year+SAVE_CONTINUE-SAVE_AFTER,go=async w=>{w=await chooseReviewWorld(w,'random');return advanceReviewWorld(w,to-w.terrain.review.state.year,'automatic');};
 const a=(await go(world)).terrain.review.state,b=(await go(restored)).terrain.review.state;
 check(JSON.stringify(a)===JSON.stringify(b),`${c.id}: continuing from the restored world differs`);
 return {status:'ok',pendingYear:s.year,activeEpisode:s.episodes.active.food.id,activeSince:s.episodes.active.food.startedYear,saveBytes:json.length,saveMs,loadMs};
}

const worlds=[];
for(const c of cases){
 const row={id:c.id,biome:c.biome,seed:c.seed},t=performance.now();
 try{
  let observed=null,checks=0;
  const {world,captures}=await run(c,POLICY,s=>{
   if(s.year%1000===0||s.year===HORIZON){checkEpisodeHistory(s);checks++;}
   if(s.year===OBSERVE)observed=JSON.stringify(episodesAt(s,OBSERVE));
  });
  const s=world.terrain.review.state;
  check(lastObservedYear(s)===HORIZON&&!s.pending&&s.episodes.committedThrough===HORIZON,`${c.id}: not committed to ${HORIZON}`);
  check(captures.length===HORIZON,`${c.id}: economy not captured once per year`);
  check(observed!==null&&JSON.stringify(episodesAt(s,OBSERVE))===observed,`${c.id}: the episodes of ${OBSERVE} changed later`);
  recheck(c,s,captures);
  row.d3a={status:'ok',historyChecks:checks,...measures(s)};
  if(c.rank===0){
   const without=(await run(c,WITHOUT)).world;
   row.sameWorldWithoutEpisodes=check(identity(world)===identity(without),`${c.id}: episodes changed the world`);
   try{row.roundTrip=await roundTrip(c);}catch(e){check(false,`${c.id} round trip: ${e.message}`);row.roundTrip={status:'failed',error:String(e.message)};}
  }
 }catch(e){check(false,`${c.id}: ${e.message}`);row.d3a={status:'failed',error:String(e.message)};}
 worlds.push(row);console.log(c.id,'seed',c.seed,ms(t)+'ms','episodes',row.d3a.episodes??'-','active',row.d3a.activeAtHorizon??'-',row.roundTrip?JSON.stringify(row.roundTrip):'');
}

const ok=worlds.filter(w=>w.d3a.status==='ok').map(w=>w.d3a),pick=f=>distribution(ok.map(f));
const results={issue:40,stage:'D3a',measureId:MEASURE_ID,quick,horizon:HORIZON,policy:POLICY,thresholds:FOOD_EPISODE_D3A,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 summary:{worlds:worlds.length,episodes:pick(m=>m.episodes),resolved:pick(m=>m.resolved),abandoned:pick(m=>m.abandoned),activeAtHorizon:pick(m=>m.activeAtHorizon),
  withResponse:pick(m=>m.withResponse),resolvedWithoutResponse:pick(m=>m.resolvedWithoutResponse),failures:pick(m=>m.failures),changes:pick(m=>m.changes),
  spread:pick(m=>m.spread),famines:pick(m=>m.famines),relapses:pick(m=>m.relapses),transitions:pick(m=>m.transitions),
  firstStart:pick(m=>m.firstStart),durationMedian:pick(m=>m.durations.median),longestActive:pick(m=>m.longestActive),
  responses:Object.fromEntries([...new Set(ok.flatMap(m=>Object.keys(m.responses)))].sort().map(k=>[k,ok.reduce((a,m)=>a+(m.responses[k]??0),0)])),
  origins:{shortage:ok.reduce((a,m)=>a+m.origins.shortage,0),famine:ok.reduce((a,m)=>a+m.origins.famine,0)},
  quietBeforeRecurrenceMedian:pick(m=>m.quietBeforeRecurrence.median),activeShare:pick(m=>m.activeShare),storeBytes:pick(m=>m.storeBytes),
  sameWorldWithoutEpisodes:worlds.filter(w=>'sameWorldWithoutEpisodes' in w).map(w=>({id:w.id,same:w.sameWorldWithoutEpisodes})),
  roundTrips:worlds.filter(w=>w.roundTrip).map(w=>({id:w.id,...w.roundTrip}))},
 worlds,failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results,(k,v)=>k==='loadMs'||k==='saveMs'?undefined:v);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d3a',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
