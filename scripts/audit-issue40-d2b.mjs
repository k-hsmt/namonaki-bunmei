/**
 * Issue #40 D2b: trial of issue-based branches and the people's own choice (review-only), D0 §7 / §12 D2b.
 *
 *   npm run build && node scripts/audit-issue40-d2b.mjs   →  artifacts/history40-d2b/report.json
 *   Env: HISTORY40_D2B_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 tuning worlds to year 5000, from the same new world, under the review policy:
 *  - d2a: hardship-linked events (D2a, adopted), production's decision lottery and uniform automatic choice;
 *  - d2b: the same events with issue-based branches and the people's own choice (no observer: autonomous observation).
 * d2b advances branch by branch ('stop'), recording each pending branch (issue, sources, weights, the people's choice)
 * and re-checking its sources (records of the year before). The first world of each biome is also saved at its first
 * branch after year 2500 (review save), restored, and continued both ways to year 3000 (the same history is required).
 * Exits 1 when a check fails.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {lastObservedYear} from '../dist/story/engine.js';
import {DECISION_CATALOG,DECISION_TIMING,ACTION_TENDENCY} from '../dist/story/decision-policy-d2b-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld,prepareReviewSave,restoreReviewSave} from '../dist/story/review-save-d2b.js';
import {MEASURE_ID,allocateSeeds,economyMeasures,eventTiming,hardshipRuns,isCivilizationEvent,distribution} from './lib/history40-measures.mjs';
import {measureCivilization,acrossWorlds,D1A_SCALARS} from './lib/history40-civilization.mjs';
import {confirmedMetricRange} from '../dist/story/civilization-metrics.js';

const out='artifacts/history40-d2b',quick=process.env.HISTORY40_D2B_QUICK==='1';
const HORIZON=quick?1000:5000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS,SAVE_AFTER=quick?500:2500,SAVE_CONTINUE=quick?700:3000;
const SETTINGS={d2a:'hardship-linked','d2b':'hardship-linked+decisions-d2b'};
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=50)console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex'),ms=t=>Math.round(performance.now()-t);
const started=performance.now(),startedAt=new Date().toISOString();
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=BIOMES.flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed,rank})));

async function run(c,setting){
 const captures=[],branches=[];let world=await createReviewWorld(c.seed,SETTINGS[setting]);
 const exchange=[{year:0,value:world.terrain.review.state.exchange}],t=performance.now();
 while(world.terrain.review.state.year<HORIZON||world.terrain.review.state.pending){
  const s0=world.terrain.review.state;
  if(s0.pending){
   const p=s0.pending,r=p.review;
   if(setting==='d2b'){
    const records=new Map(s0.history.map(x=>[x.id,x]));
    check(!!r,`${c.id}: a branch without its review record`);
    for(const id of r.sources)check(records.get(id)?.year===p.year-1,`${c.id}: ${r.templateId} in ${p.year}: source ${id} is not a record of the year before`);
    branches.push({year:p.year,templateId:r.templateId,sources:r.sources.length,evidence:r.evidence.length,weights:r.weights,chosen:r.autonomousIndex,
     actionId:r.actionIds[r.autonomousIndex]});
   }
   world=await chooseReviewWorld(world,'random',{economy:cap=>captures.push(cap)});continue;
  }
  const to=Math.min(HORIZON,(Math.floor(s0.year/1000)+1)*1000);
  world=await advanceReviewWorld(world,to-s0.year,setting==='d2b'?'stop':'automatic',{economy:cap=>captures.push(cap)});
  const s=world.terrain.review.state;
  if(!s.pending&&s.year%1000===0)exchange.push({year:s.year,value:s.exchange});
 }
 const advanceMs=ms(t),s=world.terrain.review.state;
 check(lastObservedYear(s)===HORIZON&&!s.pending,`${c.id} ${setting}: not confirmed to ${HORIZON}`);
 check(captures.length===HORIZON&&captures.every((x,i)=>x.year===i+1),`${c.id} ${setting}: economy not captured once per year`);
 const {trajectory,...m}=measureCivilization(s,HORIZON,exchange,{exchangeSampling:'every 1000 years',exchangeTrajectoryEvery:1000,check});
 const food=confirmedMetricRange(s,'food',0,HORIZON).map(p=>p.value),cohesion=confirmedMetricRange(s,'cohesion',0,HORIZON).map(p=>p.value);
 const years=s.decisions.map(d=>d.year),gaps=years.slice(1).map((y,i)=>y-years[i]);
 if(setting==='d2b'){
  check(branches.length===s.decisions.length,`${c.id}: ${branches.length} branches recorded for ${s.decisions.length} decisions`);
  check(gaps.every(g=>g>=DECISION_TIMING.minimumGap),`${c.id}: a gap below the minimum`);
  check(s.decisions.every(d=>d.chooser==='people'&&d.templateId&&d.actionId),`${c.id}: a decision without its keys`);
 }
 return {status:'ok',...m,populationAt5000:s.population,economy:economyMeasures(captures),timing:eventTiming(s.history.filter(isCivilizationEvent).map(r=>r.year),HORIZON),
  hardship:hardshipRuns(food,cohesion),branches:setting==='d2b'?branches:undefined,
  decisionGaps:{...distribution(gaps),firstYear:years[0]??null,longest:Math.max(0,...gaps,HORIZON-(years.at(-1)??0))},advanceMs,world};
}

/** Save at the first branch after SAVE_AFTER, restore, continue both to SAVE_CONTINUE: the same history is required. */
async function roundTrip(c){
 let world=await createReviewWorld(c.seed,SETTINGS.d2b);
 world=await advanceReviewWorld(world,SAVE_AFTER,'automatic');
 world=await advanceReviewWorld(world,HORIZON-SAVE_AFTER,'stop');
 const s=world.terrain.review.state;if(!check(!!s.pending,`${c.id}: no branch after ${SAVE_AFTER} for the round trip`))return {status:'no-branch'};
 let t=performance.now();const save=await prepareReviewSave(world),json=JSON.stringify(save);const saveMs=ms(t);
 t=performance.now();const restored=await restoreReviewSave(JSON.parse(json));const loadMs=ms(t);
 check(JSON.stringify(restored.terrain.review.state)===JSON.stringify(s),`${c.id}: the restored pending world differs`);
 const go=async w=>{w=await chooseReviewWorld(w,'random');return advanceReviewWorld(w,SAVE_CONTINUE-w.terrain.review.state.year,'automatic');};
 const a=(await go(world)).terrain.review.state,b=(await go(restored)).terrain.review.state;
 check(JSON.stringify(a)===JSON.stringify(b),`${c.id}: continuing from the restored world differs`);
 return {status:'ok',pendingYear:s.year,templateId:s.pending.review.templateId,saveBytes:json.length,operations:save.operations.length,saveMs,loadMs};
}

const worlds=[];
for(const c of cases){
 const row={id:c.id,biome:c.biome,seed:c.seed,settings:{}},t=performance.now();
 for(const setting of Object.keys(SETTINGS)){
  try{const {world,...r}=await run(c,setting);row.settings[setting]=r;}
  catch(e){check(false,`${c.id} ${setting}: ${e.message}`);row.settings[setting]={status:'failed',error:String(e.message)};}
 }
 if(c.rank===0){try{row.roundTrip=await roundTrip(c);}catch(e){check(false,`${c.id} round trip: ${e.message}`);row.roundTrip={status:'failed',error:String(e.message)};}}
 worlds.push(row);console.log(c.id,'seed',c.seed,ms(t)+'ms','decisions',Object.keys(SETTINGS).map(s=>`${s}:${row.settings[s]?.decisions?.count??'-'}`).join(' '),row.roundTrip?JSON.stringify(row.roundTrip):'');
}

// ---- across worlds ----
const mean=a=>a.reduce((x,v)=>x+v,0)/a.length;
const SCALARS={...D1A_SCALARS,'decisions.gapMedian':m=>m.decisionGaps.median,'decisions.gapLongest':m=>m.decisionGaps.longest,'decisions.firstYear':m=>m.decisionGaps.firstYear,
 'timing.yearsWithEvent':m=>m.timing.yearsWithEvent,'timing.quietWindows':m=>m.timing.quietWindows,'timing.yearsInRunsOfFive':m=>m.timing.yearsInRunsOfFive,
 'events.windowDispersion':m=>m.chronicle.civilizationWindowDispersion,'hardship.share':m=>m.hardship.share,'hardship.longestRun':m=>m.hardship.longestRun,
 'economy.shortageShare':m=>mean(m.economy.districts.map(d=>d.shortageYears))/m.economy.years};
const rowsFor=setting=>worlds.map(w=>({biome:w.biome,v:w.settings[setting]??{status:'failed'}}));
const branches=worlds.flatMap(w=>w.settings.d2b?.branches??[]);
const byTemplate=Object.fromEntries(DECISION_CATALOG.map(e=>[e.templateId,branches.filter(b=>b.templateId===e.templateId).length]));
const actions={};for(const b of branches)actions[b.actionId]=(actions[b.actionId]??0)+1;
// experience → tendency: how often the chosen action is one an institution favours, against the share expected if uniform
const tendency=(()=>{const rows=branches.filter(b=>b.weights.some(w=>w>1));
 const chosenFavoured=rows.filter(b=>b.weights[b.chosen]>1).length,uniformExpected=rows.reduce((a,b)=>a+b.weights.filter(w=>w>1).length/b.weights.length,0),weightedExpected=rows.reduce((a,b)=>a+b.weights.filter(w=>w>1).reduce((x,w)=>x+w,0)/b.weights.reduce((x,w)=>x+w,0),0);
 return {branchesWithAFavouredAction:rows.length,chosenFavoured,expectedIfUniform:+uniformExpected.toFixed(1),expectedByWeights:+weightedExpected.toFixed(1)};})();
const results={issue:40,stage:'D2b',measureId:MEASURE_ID,quick,horizon:HORIZON,settings:SETTINGS,timing:DECISION_TIMING,
 catalog:DECISION_CATALOG,actionTendency:ACTION_TENDENCY,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 summary:{branches:branches.length,byTemplate,actions,tendency,withSources:branches.filter(b=>b.sources>0).length,withEvidenceOnly:branches.filter(b=>!b.sources&&b.evidence).length,
  across:Object.fromEntries(Object.keys(SETTINGS).map(s=>[s,acrossWorlds(rowsFor(s),'v',SCALARS,BIOMES)])),
  roundTrips:worlds.filter(w=>w.roundTrip).map(w=>({id:w.id,...w.roundTrip}))},
 worlds:worlds.map(w=>({...w,settings:Object.fromEntries(Object.entries(w.settings).map(([k,{advanceMs,...v}])=>[k,v]))})),failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null,
 advanceMs:Object.fromEntries(Object.keys(SETTINGS).map(s=>[s,distribution(worlds.map(w=>w.settings[s]?.advanceMs))]))};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d2b',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
