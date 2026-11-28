/**
 * Issue #40 D2c: trial of the common episode frame (review-only), D0 §4.1 / §8 / §12 D2c.
 *
 *   npm run build && node scripts/audit-issue40-d2c.mjs   →  artifacts/history40-d2c/report.json
 *   Env: HISTORY40_D2C_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 tuning worlds to year 5000 under hardship-linked + decisions-d2b + the episode probe (probe-d2c), branch by
 * branch, every branch left to the people (autonomous observation). Per world:
 *  - the whole typed history is rebuilt and checked every 1000 years and at the end (checkEpisodeHistory);
 *  - the episodes observed in year 2500 must be the same when read again in year 5000 (later years never change them);
 *  - every transition is re-checked against what it cites, independently of the frame: a start cites shortage records
 *    of its own year, a reassessment the records of a new district's shortage, a resolution 5 years of coverage >= 0.90
 *    in the economy captured over those years;
 *  - the first world of each biome is also run without episodes (D2b): the civilization and the architecture ledger must
 *    be the same (episodes write nothing else), and is saved at its first branch after 2500 with an active episode,
 *    restored, and continued both ways for 500 more years.
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

const out='artifacts/history40-d2c',quick=process.env.HISTORY40_D2C_QUICK==='1';
const HORIZON=quick?1000:5000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS,OBSERVE=quick?500:2500,SAVE_AFTER=quick?500:2500,SAVE_CONTINUE=quick?700:3000;
const POLICY='hardship-linked+decisions-d2b+episodes-probe-d2c',WITHOUT='hardship-linked+decisions-d2b';
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

const SHORTAGE=/の食糧不足が続く$/;
/** Re-checks each transition against what it cites (independently of the frame's own checks). */
function recheck(c,s,captures){
 const records=new Map(s.history.map(r=>[r.id,r])),byYear=new Map(captures.map(x=>[x.year,x]));
 for(const t of s.episodes?.transitions??[]){
  const at=`${c.id} ${t.id} ${t.kind}@${t.year}`,cited=t.evidence.filter(e=>e.type==='record').map(e=>records.get(e.id));
  if(t.kind==='started'||t.kind==='reassessed'){
   check(cited.length>0&&cited.every(r=>r&&r.year===t.year&&SHORTAGE.test(r.title)),`${at}: does not cite this year's shortage records`);
  }else if(t.kind==='resolved'){
   // each capture holds that year's coverage: the 5 years up to the resolution must all be 0.90 or more
   const years=[0,1,2,3,4].map(i=>byYear.get(t.year-i)?.economy?.districts);
   check(years.every(ds=>ds&&ds.length>0&&ds.every(d=>d.coverage!==null&&d.coverage>=.9)),`${at}: coverage of the 5 years does not support the resolution`);
  }else check(false,`${at}: the probe never makes this transition`);
 }
}

function measures(s){
 const episodes=episodesAt(s,s.episodes.committedThrough),ended=episodes.filter(e=>e.endedYear!==null);
 const recurrences=episodes.slice(1).map((e,i)=>episodes[i].endedYear===null?null:e.startedYear-episodes[i].endedYear).filter(x=>x!==null);
 const activeYears=episodes.reduce((a,e)=>a+((e.endedYear??HORIZON)-e.startedYear),0);
 return {episodes:episodes.length,resolved:ended.length,activeAtHorizon:episodes.length-ended.length,transitions:s.episodes.transitions.length,
  reassessed:s.episodes.transitions.filter(t=>t.kind==='reassessed').length,firstStart:episodes[0]?.startedYear??null,
  durations:distribution(ended.map(e=>e.endedYear-e.startedYear)),longestActive:Math.max(0,...episodes.map(e=>(e.endedYear??HORIZON)-e.startedYear)),
  quietBeforeRecurrence:distribution(recurrences),activeShare:+(activeYears/HORIZON).toFixed(3),storeBytes:JSON.stringify(s.episodes).length};
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
  row.d2c={status:'ok',historyChecks:checks,...measures(s)};
  if(c.rank===0){
   const without=(await run(c,WITHOUT)).world;
   row.sameWorldWithoutEpisodes=check(identity(world)===identity(without),`${c.id}: episodes changed the world`);
   try{row.roundTrip=await roundTrip(c);}catch(e){check(false,`${c.id} round trip: ${e.message}`);row.roundTrip={status:'failed',error:String(e.message)};}
  }
 }catch(e){check(false,`${c.id}: ${e.message}`);row.d2c={status:'failed',error:String(e.message)};}
 worlds.push(row);console.log(c.id,'seed',c.seed,ms(t)+'ms','episodes',row.d2c.episodes??'-','active',row.d2c.activeAtHorizon??'-',row.roundTrip?JSON.stringify(row.roundTrip):'');
}

const ok=worlds.filter(w=>w.d2c.status==='ok').map(w=>w.d2c),pick=f=>distribution(ok.map(f));
const results={issue:40,stage:'D2c',measureId:MEASURE_ID,quick,horizon:HORIZON,policy:POLICY,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 summary:{worlds:worlds.length,episodes:pick(m=>m.episodes),resolved:pick(m=>m.resolved),activeAtHorizon:pick(m=>m.activeAtHorizon),transitions:pick(m=>m.transitions),
  reassessed:pick(m=>m.reassessed),firstStart:pick(m=>m.firstStart),durationMedian:pick(m=>m.durations.median),longestActive:pick(m=>m.longestActive),
  quietBeforeRecurrenceMedian:pick(m=>m.quietBeforeRecurrence.median),activeShare:pick(m=>m.activeShare),storeBytes:pick(m=>m.storeBytes),
  sameWorldWithoutEpisodes:worlds.filter(w=>'sameWorldWithoutEpisodes' in w).map(w=>({id:w.id,same:w.sameWorldWithoutEpisodes})),
  roundTrips:worlds.filter(w=>w.roundTrip).map(w=>({id:w.id,...w.roundTrip}))},
 worlds,failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results,(k,v)=>k==='loadMs'||k==='saveMs'?undefined:v);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d2c',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
