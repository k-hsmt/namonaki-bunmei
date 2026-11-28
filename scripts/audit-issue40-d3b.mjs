/**
 * Issue #40 D3b: trial of the trade system on the episode frame (review-only), D0 §4.2 / §12 D3b.
 *
 *   npm run build && node scripts/audit-issue40-d3b.mjs   →  artifacts/history40-d3b/report.json
 *   Env: HISTORY40_D3B_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 tuning worlds of D3a (the same seeds) to year 5000 under hardship-linked + decisions-d2b + the trade system
 * (trade-d3b), branch by
 * branch, every branch left to the people (autonomous observation). Per world:
 *  - the whole typed history is rebuilt and checked every 1000 years and at the end (checkEpisodeHistory);
 *  - the episodes observed in year 2500 must be the same when read again in year 5000;
 *  - every transition is re-checked against its sources by scripts/lib/history40-trade.mjs (written apart from the
 *    definition), using the chronicle, the decisions and the economy captured each year;
 *  - the first world of each biome is also run without episodes (D2b): the civilization and the architecture ledger must
 *    be the same (the trade system applies no effect), and is saved at its first branch after 2500 with an active trade
 *    episode (or, without such a branch, in the first year after 2500 with one), restored, and continued both ways for
 *    500 more years.
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
import {recheckTradeEpisodes} from './lib/history40-trade.mjs';
import {TRADE_EPISODE_D3B} from '../dist/story/episode-trade-d3b-review.js';
import {links} from '../dist/story/regional-economy.js';

const out='artifacts/history40-d3b',quick=process.env.HISTORY40_D3B_QUICK==='1';
const HORIZON=quick?1000:5000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS,OBSERVE=quick?500:2500,SAVE_AFTER=quick?500:2500,SAVE_CONTINUE=quick?700:3000;
const POLICY='hardship-linked+decisions-d2b+episodes-trade-d3b',WITHOUT='hardship-linked+decisions-d2b';
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

function recheck(c,s,captures){for(const p of recheckTradeEpisodes(s,captures,links))check(false,`${c.id} ${p}`);}

function measures(s){
 const episodes=episodesAt(s,s.episodes.committedThrough),ts=s.episodes.transitions,ended=episodes.filter(e=>e.endedYear!==null);
 const count=f=>ts.filter(f).length,responded=episodes.filter(e=>e.transitions.some(t=>t.kind==='response-started'));
 const recurrences=episodes.slice(1).map((e,i)=>episodes[i].endedYear===null?null:e.startedYear-episodes[i].endedYear).filter(x=>x!==null);
 const activeYears=episodes.reduce((a,e)=>a+((e.endedYear??HORIZON)-e.startedYear),0);
 const tally=f=>{const o={};for(const t of ts){const k=f(t);if(k)o[k]=(o[k]??0)+1;}return o;};
 const record=id=>s.history.find(h=>h.id===id);
 const origins={closure:0,lapse:0,agreement:0};for(const e of episodes){const title=record(e.transitions[0].evidence[0].id)?.title??'';origins[/往来が途絶える$/.test(title)?'closure':/共同管理が休止する$/.test(title)?'lapse':'agreement']++;}
 // closures that no trade episode cites: the route had not traded in 20 years (a year without trade is not a relation)
 const cited=new Set(ts.flatMap(t=>t.evidence.filter(x=>x.type==='record').map(x=>x.id)));
 const closures=s.history.filter(r=>/を結ぶ往来が途絶える$/.test(r.title));
 // years an open route waited for trade (reopened or lapsed → trade resumed)
 const waits=[];for(const e of episodes){let open=null;for(const t of e.transitions){if(t.reason==='route-reopened'||(t.kind==='started'&&t.state.phase==='open')||t.reason==='upkeep-lapsed')open=t.year;if(t.reason==='trade-resumed'&&open!==null){waits.push(t.year-open);open=null;}}}
 return {episodes:episodes.length,resolved:episodes.filter(e=>e.status==='resolved').length,abandoned:episodes.filter(e=>e.status==='abandoned').length,activeAtHorizon:episodes.length-ended.length,
  ends:tally(t=>t.kind==='resolved'||t.kind==='abandoned'?t.kind+':'+t.reason:null),
  withResponse:responded.length,resolvedWithoutResponse:episodes.filter(e=>e.status==='resolved'&&!e.transitions.some(t=>t.kind.startsWith('response'))).length,
  responses:tally(t=>t.kind==='response-started'?t.reason:t.kind==='response-changed'?t.reason.replace(/^to-/,''):null),
  failures:tally(t=>t.kind==='response-failed'?t.reason:null),changes:count(t=>t.kind==='response-changed'),
  reassessed:tally(t=>t.kind==='reassessed'?t.reason:null),origins,
  closures:closures.length,closuresUncited:closures.filter(r=>!cited.has(r.id)).length,waitForTrade:distribution(waits),
  transitions:ts.length,firstStart:episodes[0]?.startedYear??null,durations:distribution(ended.map(e=>e.endedYear-e.startedYear)),
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
  if(!s.pending){world=null;break;}
  if(s.episodes.active.trade)break;
  world=await chooseReviewWorld(world,'random');
 }
 // trade episodes are active in few years: without a branch during one, save in the first year one is active
 if(!world){
  world=await advanceReviewWorld(await createReviewWorld(c.seed,POLICY),SAVE_AFTER,'automatic');
  while(!world.terrain.review.state.episodes.active.trade&&world.terrain.review.state.year<HORIZON)world=await advanceReviewWorld(world,1,'automatic');
  if(!world.terrain.review.state.episodes.active.trade){check(false,`${c.id}: no year with an active episode after ${SAVE_AFTER}`);return {status:'none'};}
 }
 const s=world.terrain.review.state;check(s.episodes.committedThrough===(s.pending?s.year-1:s.year),`${c.id}: the committed year is wrong`);
 let t=performance.now();const save=await prepareReviewSave(world),json=JSON.stringify(save);const saveMs=ms(t);
 t=performance.now();const restored=await restoreReviewSave(JSON.parse(json));const loadMs=ms(t);
 check(JSON.stringify(restored.terrain.review.state)===JSON.stringify(s),`${c.id}: the restored world differs`);
 const to=s.year+SAVE_CONTINUE-SAVE_AFTER,go=async w=>{if(w.terrain.review.state.pending)w=await chooseReviewWorld(w,'random');return advanceReviewWorld(w,to-w.terrain.review.state.year,'automatic');};
 const a=(await go(world)).terrain.review.state,b=(await go(restored)).terrain.review.state;
 check(JSON.stringify(a)===JSON.stringify(b),`${c.id}: continuing from the restored world differs`);
 return {status:'ok',year:s.year,pending:!!s.pending,activeEpisode:s.episodes.active.trade.id,activeSince:s.episodes.active.trade.startedYear,saveBytes:json.length,saveMs,loadMs};
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
  row.d3b={status:'ok',historyChecks:checks,...measures(s)};
  if(c.rank===0){
   const without=(await run(c,WITHOUT)).world;
   row.sameWorldWithoutEpisodes=check(identity(world)===identity(without),`${c.id}: episodes changed the world`);
   try{row.roundTrip=await roundTrip(c);}catch(e){check(false,`${c.id} round trip: ${e.message}`);row.roundTrip={status:'failed',error:String(e.message)};}
  }
 }catch(e){check(false,`${c.id}: ${e.message}`);row.d3b={status:'failed',error:String(e.message)};}
 worlds.push(row);console.log(c.id,'seed',c.seed,ms(t)+'ms','episodes',row.d3b.episodes??'-','active',row.d3b.activeAtHorizon??'-',row.roundTrip?JSON.stringify(row.roundTrip):'');
}

const ok=worlds.filter(w=>w.d3b.status==='ok').map(w=>w.d3b),pick=f=>distribution(ok.map(f));
const sum=f=>{const o={};for(const m of ok)for(const [k,v] of Object.entries(f(m)))o[k]=(o[k]??0)+v;return Object.fromEntries(Object.entries(o).sort());};
const results={issue:40,stage:'D3b',measureId:MEASURE_ID,quick,horizon:HORIZON,policy:POLICY,thresholds:TRADE_EPISODE_D3B,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 summary:{worlds:worlds.length,episodes:pick(m=>m.episodes),resolved:pick(m=>m.resolved),abandoned:pick(m=>m.abandoned),activeAtHorizon:pick(m=>m.activeAtHorizon),
  withResponse:pick(m=>m.withResponse),resolvedWithoutResponse:pick(m=>m.resolvedWithoutResponse),changes:pick(m=>m.changes),
  closures:pick(m=>m.closures),closuresUncited:pick(m=>m.closuresUncited),waitForTradeMedian:pick(m=>m.waitForTrade.median),waitForTradeMax:pick(m=>m.waitForTrade.max),
  transitions:pick(m=>m.transitions),firstStart:pick(m=>m.firstStart),durationMedian:pick(m=>m.durations.median),longestActive:pick(m=>m.longestActive),
  ends:sum(m=>m.ends),responses:sum(m=>m.responses),failures:sum(m=>m.failures),reassessed:sum(m=>m.reassessed),origins:sum(m=>m.origins),
  worldsWith:{failure:ok.filter(m=>Object.keys(m.failures).length).length,response:ok.filter(m=>m.withResponse).length,abandoned:ok.filter(m=>m.abandoned).length,converted:ok.filter(m=>m.ends['resolved:supply-converted']).length},
  quietBeforeRecurrenceMedian:pick(m=>m.quietBeforeRecurrence.median),activeShare:pick(m=>m.activeShare),storeBytes:pick(m=>m.storeBytes),
  sameWorldWithoutEpisodes:worlds.filter(w=>'sameWorldWithoutEpisodes' in w).map(w=>({id:w.id,same:w.sameWorldWithoutEpisodes})),
  roundTrips:worlds.filter(w=>w.roundTrip).map(w=>({id:w.id,...w.roundTrip}))},
 worlds,failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results,(k,v)=>k==='loadMs'||k==='saveMs'?undefined:v);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d3b',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
