/**
 * Issue #40 D3c: trial of the disaster-recovery system on the episode frame (review-only), D0 §4.2 / §12 D3c.
 *
 *   npm run build && node scripts/audit-issue40-d3c.mjs   →  artifacts/history40-d3c/report.json
 *   Env: HISTORY40_D3C_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 tuning worlds of D3a/D3b (the same seeds) to year 5000 under hardship-linked + decisions-d2b + the recovery
 * system (recovery-d3c), branch by branch, every branch left to the people (autonomous observation). Per world:
 *  - the whole typed history is rebuilt and checked every 1000 years and at the end (checkEpisodeHistory);
 *  - the episodes observed in year 2500 must be the same when read again in year 5000;
 *  - every transition is re-checked against the chronicle by scripts/lib/history40-recovery.mjs (written apart from
 *    the definition), and nothing is missed (every disaster damage, and every later record of a damaged object);
 *  - the first world of each biome is also run without episodes (D2b): the civilization and the architecture ledger must
 *    be the same (the recovery system applies no effect), and is saved at its first branch after 2500 with an active
 *    recovery episode (or, without such a branch, in the first year after 2500 with one), restored, and continued both
 *    ways for 500 more years.
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
import {recheckRecoveryEpisodes} from './lib/history40-recovery.mjs';
import {RECOVERY_DISASTERS} from '../dist/story/episode-recovery-d3c-review.js';

const out='artifacts/history40-d3c',quick=process.env.HISTORY40_D3C_QUICK==='1';
const HORIZON=quick?1000:5000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS,OBSERVE=quick?500:2500,SAVE_AFTER=quick?500:2500,SAVE_CONTINUE=quick?700:3000;
const POLICY='hardship-linked+decisions-d2b+episodes-recovery-d3c',WITHOUT='hardship-linked+decisions-d2b';
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

function recheck(c,s){for(const p of recheckRecoveryEpisodes(s))check(false,`${c.id} ${p}`);}

const DISASTERS=new Set(RECOVERY_DISASTERS);
function measures(s,world){
 const episodes=episodesAt(s,s.episodes.committedThrough),ts=s.episodes.transitions,ended=episodes.filter(e=>e.endedYear!==null);
 const count=f=>ts.filter(f).length,responded=episodes.filter(e=>e.transitions.some(t=>t.kind==='response-started'));
 const recurrences=episodes.slice(1).map((e,i)=>episodes[i].endedYear===null?null:e.startedYear-episodes[i].endedYear).filter(x=>x!==null);
 const activeYears=episodes.reduce((a,e)=>a+((e.endedYear??HORIZON)-e.startedYear),0);
 const tally=f=>{const o={};for(const t of ts){const k=f(t);if(k)o[k]=(o[k]??0)+1;}return o;};
 const byId=new Map(s.history.map(r=>[r.id,r])),kindOf=id=>byId.get(id)?.kind??'';
 const disasters=s.history.filter(r=>DISASTERS.has(r.kind)),damage=s.history.filter(r=>/-damaged$/.test(r.kind??''));
 const damaging=new Set(damage.flatMap(d=>(d.relatedIds??[]).filter(id=>DISASTERS.has(kindOf(id)))));
 const disasterKinds={},originKinds={};for(const r of disasters){const k=r.kind+(damaging.has(r.id)?':damage':':none');disasterKinds[k]=(disasterKinds[k]??0)+1;}
 // floods that start or widen a recovery episode and also close a route (a closure record cites them): the overlap with trade
 const closureCites=new Set(s.history.filter(r=>/を結ぶ往来が途絶える$/.test(r.title)).flatMap(r=>r.relatedIds??[]));
 let floodsInRecovery=0,floodsAlsoClosing=0;
 for(const t of ts)for(const x of t.evidence)if(x.type==='record'&&kindOf(x.id)==='flood'){floodsInRecovery++;if(closureCites.has(x.id))floodsAlsoClosing++;}
 for(const e of episodes)for(const id of e.originRecordIds)if(DISASTERS.has(kindOf(id)))originKinds[kindOf(id)]=(originKinds[kindOf(id)]??0)+1;
 // objects per episode; years from the start to the first response; the delay of a record waiting in the queue
 const objects=episodes.map(e=>Object.keys(e.transitions.at(-1).state.objects).length);
 const firstResponse=episodes.map(e=>{const r=e.transitions.find(t=>t.kind==='response-started');return r?r.year-e.startedYear:null;}).filter(x=>x!==null);
 const acted=ts.filter(t=>t.kind!=='resolved'&&t.kind!=='abandoned').flatMap(t=>t.evidence.filter(x=>x.type==='record'&&/-(repaired|abandoned|ruined|reused)$/.test(kindOf(x.id))).map(x=>t.year-byId.get(x.id).year));
 // ruins left when an episode ends left-in-ruin: restored later (outside the episode) or never
 const ruinsLeft={restoredLater:0,never:0},ruinLag=[];
 const objectRecords=new Map();for(const r of s.history)if(r.buildingId&&/^(building|housing)-/.test(r.kind??''))(objectRecords.get(r.kind.split('-')[0]+':'+r.buildingId)??objectRecords.set(r.kind.split('-')[0]+':'+r.buildingId,[]).get(r.kind.split('-')[0]+':'+r.buildingId)).push(r);
 for(const e of episodes.filter(e=>e.status==='abandoned'))for(const [k,o] of Object.entries(e.transitions.at(-1).state.objects)){
  if(o.status!=='ruined')continue;const later=(objectRecords.get(k)??[]).find(r=>r.year>e.endedYear&&/-(reused|repaired)$/.test(r.kind));
  if(later){ruinsLeft.restoredLater++;ruinLag.push(later.year-e.endedYear);}else ruinsLeft.never++;
 }
 const waterways={};for(const ev of world.terrain.irrigation?.events??[])if(ev.kind==='damaged'||ev.kind==='repaired'){const k=ev.kind+':'+ev.cause.kind;waterways[k]=(waterways[k]??0)+1;}
 return {episodes:episodes.length,resolved:episodes.filter(e=>e.status==='resolved').length,abandoned:episodes.filter(e=>e.status==='abandoned').length,activeAtHorizon:episodes.length-ended.length,
  ends:tally(t=>t.kind==='resolved'||t.kind==='abandoned'?t.kind+':'+t.reason:null),
  withResponse:responded.length,abandonedWithoutResponse:episodes.filter(e=>e.status==='abandoned'&&!e.transitions.some(t=>t.kind.startsWith('response'))).length,
  responses:tally(t=>t.kind==='response-started'?t.reason:t.kind==='response-changed'?t.reason.replace(/^to-/,''):null),
  failures:tally(t=>t.kind==='response-failed'?t.reason:null),changes:count(t=>t.kind==='response-changed'),
  reassessed:tally(t=>t.kind==='reassessed'?t.reason:null),
  disasters:disasters.length,disastersWithDamage:damaging.size,disasterKinds,originKinds,damageRecords:damage.length,
  floodsInRecovery,floodsAlsoClosing,objects:distribution(objects),firstResponse:distribution(firstResponse),queueDelay:distribution(acted),
  ruinsLeft,ruinRestoredAfter:distribution(ruinLag),waterways,
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
  if(s.episodes.active.recovery)break;
  world=await chooseReviewWorld(world,'random');
 }
 // recovery episodes are active in few years: without a branch during one, save in the first year one is active
 if(!world){
  // the year is read from the episodes of the same world run on; the save then holds two advances, not one per year
  const base=await advanceReviewWorld(await createReviewWorld(c.seed,POLICY),SAVE_AFTER,'automatic');
  const ahead=(await advanceReviewWorld(base,HORIZON-SAVE_AFTER,'automatic')).terrain.review.state;
  const e=episodesAt(ahead,HORIZON).find(e=>(e.endedYear??HORIZON+1)>SAVE_AFTER&&e.startedYear<HORIZON);
  if(!e){check(false,`${c.id}: no year with an active episode after ${SAVE_AFTER}`);return {status:'none'};}
  const year=Math.max(SAVE_AFTER,e.startedYear);
  world=year>SAVE_AFTER?await advanceReviewWorld(base,year-SAVE_AFTER,'automatic'):base;
  if(!world.terrain.review.state.episodes.active.recovery){check(false,`${c.id}: no active episode in ${year}`);return {status:'none'};}
 }
 const s=world.terrain.review.state;check(s.episodes.committedThrough===(s.pending?s.year-1:s.year),`${c.id}: the committed year is wrong`);
 let t=performance.now();const save=await prepareReviewSave(world),json=JSON.stringify(save);const saveMs=ms(t);
 t=performance.now();const restored=await restoreReviewSave(JSON.parse(json));const loadMs=ms(t);
 check(JSON.stringify(restored.terrain.review.state)===JSON.stringify(s),`${c.id}: the restored world differs`);
 const to=s.year+SAVE_CONTINUE-SAVE_AFTER,go=async w=>{if(w.terrain.review.state.pending)w=await chooseReviewWorld(w,'random');return advanceReviewWorld(w,to-w.terrain.review.state.year,'automatic');};
 const a=(await go(world)).terrain.review.state,b=(await go(restored)).terrain.review.state;
 check(JSON.stringify(a)===JSON.stringify(b),`${c.id}: continuing from the restored world differs`);
 return {status:'ok',year:s.year,pending:!!s.pending,activeEpisode:s.episodes.active.recovery.id,activeSince:s.episodes.active.recovery.startedYear,saveBytes:json.length,saveMs,loadMs};
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
  recheck(c,s);
  row.d3c={status:'ok',historyChecks:checks,...measures(s,world)};
  if(c.rank===0){
   const without=(await run(c,WITHOUT)).world;
   row.sameWorldWithoutEpisodes=check(identity(world)===identity(without),`${c.id}: episodes changed the world`);
   try{row.roundTrip=await roundTrip(c);}catch(e){check(false,`${c.id} round trip: ${e.message}`);row.roundTrip={status:'failed',error:String(e.message)};}
  }
 }catch(e){check(false,`${c.id}: ${e.message}`);row.d3c={status:'failed',error:String(e.message)};}
 worlds.push(row);console.log(c.id,'seed',c.seed,ms(t)+'ms','episodes',row.d3c.episodes??'-','active',row.d3c.activeAtHorizon??'-',row.roundTrip?JSON.stringify(row.roundTrip):'');
}

const ok=worlds.filter(w=>w.d3c.status==='ok').map(w=>w.d3c),pick=f=>distribution(ok.map(f));
const sum=f=>{const o={};for(const m of ok)for(const [k,v] of Object.entries(f(m)))o[k]=(o[k]??0)+v;return Object.fromEntries(Object.entries(o).sort());};
const results={issue:40,stage:'D3c',measureId:MEASURE_ID,quick,horizon:HORIZON,policy:POLICY,disasters:RECOVERY_DISASTERS,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 summary:{worlds:worlds.length,episodes:pick(m=>m.episodes),resolved:pick(m=>m.resolved),abandoned:pick(m=>m.abandoned),activeAtHorizon:pick(m=>m.activeAtHorizon),
  withResponse:pick(m=>m.withResponse),abandonedWithoutResponse:pick(m=>m.abandonedWithoutResponse),changes:pick(m=>m.changes),
  disasters:pick(m=>m.disasters),disastersWithDamage:pick(m=>m.disastersWithDamage),damageRecords:pick(m=>m.damageRecords),
  objectsMedian:pick(m=>m.objects.median),objectsMax:pick(m=>m.objects.max),firstResponseMedian:pick(m=>m.firstResponse.median),firstResponseMax:pick(m=>m.firstResponse.max),
  queueDelayMax:pick(m=>m.queueDelay.max),
  transitions:pick(m=>m.transitions),firstStart:pick(m=>m.firstStart),durationMedian:pick(m=>m.durations.median),longestActive:pick(m=>m.longestActive),
  ends:sum(m=>m.ends),responses:sum(m=>m.responses),failures:sum(m=>m.failures),reassessed:sum(m=>m.reassessed),
  disasterKinds:sum(m=>m.disasterKinds),originKinds:sum(m=>m.originKinds),floodsInRecovery:sum(m=>({n:m.floodsInRecovery})).n??0,floodsAlsoClosing:sum(m=>({n:m.floodsAlsoClosing})).n??0,
  ruinsLeft:sum(m=>m.ruinsLeft),ruinRestoredAfterMedian:pick(m=>m.ruinRestoredAfter.median),waterways:sum(m=>m.waterways),
  worldsWith:{failure:ok.filter(m=>Object.keys(m.failures).length).length,response:ok.filter(m=>m.withResponse).length,abandoned:ok.filter(m=>m.abandoned).length,change:ok.filter(m=>m.changes).length},
  quietBeforeRecurrenceMedian:pick(m=>m.quietBeforeRecurrence.median),activeShare:pick(m=>m.activeShare),storeBytes:pick(m=>m.storeBytes),
  sameWorldWithoutEpisodes:worlds.filter(w=>'sameWorldWithoutEpisodes' in w).map(w=>({id:w.id,same:w.sameWorldWithoutEpisodes})),
  roundTrips:worlds.filter(w=>w.roundTrip).map(w=>({id:w.id,...w.roundTrip}))},
 worlds,failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results,(k,v)=>k==='loadMs'||k==='saveMs'?undefined:v);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d3c',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
