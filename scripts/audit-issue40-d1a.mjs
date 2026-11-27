/**
 * Issue #40 D1a: audit base and preliminary baseline trial of the CURRENT production history (D0 §10.1, §11, §12 D1a).
 *
 *   npm run build && node scripts/audit-issue40-d1a.mjs   →  artifacts/history40-d1a/report.json
 *   Env: HISTORY40_D1A_QUICK=1 (3 worlds to year 300: CI), REVIEW_SOURCE_SHA (commit recorded in the report).
 *
 * Read-only: nothing under src/ is changed or extended; every value is read through the existing readers
 * (#29 confirmed metric ledger, observation ledger, settlement ledger, memory log, chronicle). Two models, kept apart:
 *  - full: the current new world (createNewArchitectureWorld: terrain, economy, irrigation, architecture), advanced with
 *    the production automatic choices. This is the model the final acceptance uses (D0 §10.1).
 *  - engine: story/engine alone (createCivilization + step + chooseAutomatically), no land. Cheap; for comparison only.
 * Exchange is not in the #29 ledger. The engine model reads it every confirmed year. The full model reads it every
 * EXCHANGE_EVERY years by advancing in chunks (one-year chunks cost ~50–270 ms each); the other years are reported as
 * missing, never filled in. The chunked world must equal the one-go world (state and save), so sampling changes nothing.
 * Checks (exit 1 on failure): one-go = chunked (state and save); save → restore gives the same state; the engine model
 * gives the same state when run twice; every world is confirmed up to the horizon with nothing pending.
 * A world that fails is reported as failed, never dropped or replaced (D0 §11.1).
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {BIOME_KINDS,generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {createCivilization,step,chooseAutomatically,lastObservedYear} from '../dist/story/engine.js';
import {observationAt} from '../dist/story/observations.js';
import {confirmedMetricRange} from '../dist/story/civilization-metrics.js';
import {MEASURE_ID,ANALYSIS,distribution,firstYearAtLeast,declines,boundedSeries,siteResidency,centerMoves,chronicleMeasures,memoryMeasures,decisionMeasures,allocateSeeds} from './lib/history40-measures.mjs';

const out='artifacts/history40-d1a',quick=process.env.HISTORY40_D1A_QUICK==='1';
const HORIZON=quick?300:1000,PER_BIOME=quick?1:3,EXCHANGE_EVERY=25,TRAJECTORY_EVERY=10,POPULATION_FLOOR=60;
const QUICK_BIOMES=['desert','temperate_forest','tundra'];
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex');
const ms=t=>Math.round(performance.now()-t);
const started=performance.now(),startedAt=new Date().toISOString();

// Seeds are fixed before any trial (D0 §11.1): D1a/D1b draw from tuning, D4/D5 from acceptance (never used to tune).
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=(quick?QUICK_BIOMES:BIOME_KINDS).flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed,rank})));

/** Every measure of one confirmed civilization up to `horizon`. `exchange` is [{year,value}] as observed. */
function measure(state,horizon,exchange,exchangeSampling){
 check(lastObservedYear(state)===horizon&&!state.pending,`seed ${state.seed}: not confirmed up to ${horizon}`);
 const series=Object.fromEntries(['population','food','cohesion','knowledge','culture'].map(k=>[k,confirmedMetricRange(state,k,0,horizon)]));
 for(const [k,s] of Object.entries(series))check(s.length===horizon+1,`seed ${state.seed}: ${k} has ${s.length} confirmed years`);
 const ledger=state.observation,people=[];
 for(let y=0;y<=horizon;y++){const o=observationAt(ledger,y);people.push({year:y,people:o.residents.slice(0,3).map(r=>r.population)});
  if(y%97===0)check(o.population===series.population[y].value,`seed ${state.seed}: population ${y} disagrees between readers`);}
 const pop=series.population.map(p=>p.value),sites=ledger.sites.map(site=>siteResidency(site.changes,horizon));
 const traj=Object.fromEntries(Object.entries(series).map(([k,s])=>[k,s.filter(p=>p.year%TRAJECTORY_EVERY===0).map(p=>+p.value.toFixed(2))]));
 return {
  population:{...distribution(pop),start:pop[0],end:pop.at(-1),floorYears:pop.filter(v=>v<=POPULATION_FLOOR).length,declines:declines(series.population)},
  metrics:{...Object.fromEntries(['food','cohesion','knowledge','culture'].map(k=>[k,{...boundedSeries(series[k].map(p=>p.value)),firstNearHighYear:firstYearAtLeast(series[k],ANALYSIS.capHigh)}])),
   exchange:{...boundedSeries(exchange.map(p=>p.value)),firstNearHighYear:firstYearAtLeast(exchange,ANALYSIS.capHigh),sampling:exchangeSampling,observedYears:exchange.length,missingYears:horizon+1-exchange.length}},
  populationMinYear:series.population.reduce((b,p)=>p.value<b.value?p:b).year,
  sites,center:centerMoves(people),
  chronicle:chronicleMeasures(state.history,horizon),
  memory:memoryMeasures(state.memory.log,state.memory.legacies,horizon),
  decisions:decisionMeasures(state.decisions,horizon),
  trajectory:{every:TRAJECTORY_EVERY,...traj,exchange:exchange.filter(p=>p.year%(exchangeSampling==='every year'?TRAJECTORY_EVERY:EXCHANGE_EVERY)===0).map(p=>[p.year,+p.value.toFixed(2)])},
  identity:{name:state.name,homeland:state.homeland,trait:state.trait},
 };
}

async function fullWorld(c){
 const timing={};let t=performance.now();
 const created=(await createNewArchitectureWorld(c.seed)).architecture;timing.createMs=ms(t);
 t=performance.now();const oneGo=await advanceArchitectureWorld(created,HORIZON,'automatic');timing.advanceOneGoMs=ms(t);
 t=performance.now();let chunked=created;const exchange=[{year:0,value:architectureProductionSession(created).state.exchange}];
 for(let y=EXCHANGE_EVERY;y<=HORIZON;y+=EXCHANGE_EVERY){
  chunked=await advanceArchitectureWorld(chunked,EXCHANGE_EVERY,'automatic');const s=architectureProductionSession(chunked).state;
  // the live value is the confirmed one only when the year is confirmed and nothing is pending
  if(check(!s.pending&&lastObservedYear(s)===y,`${c.id}: year ${y} not confirmed at a chunk boundary`))exchange.push({year:y,value:s.exchange});
 }
 timing.advanceChunkedMs=ms(t);
 const A=architectureProductionSession(oneGo),B=architectureProductionSession(chunked);
 check(JSON.stringify(A.state)===JSON.stringify(B.state),`${c.id}: one-go and chunked states differ`);
 t=performance.now();const packet=await prepareWorldSessionSave(A),encoded=await encodeWorldSave(packet);timing.saveMs=ms(t);
 check(JSON.stringify(packet)===JSON.stringify(await prepareWorldSessionSave(B)),`${c.id}: one-go and chunked saves differ`);
 t=performance.now();const restored=restoreWorldSession(await decodeWorldSave(encoded.json));timing.loadMs=ms(t);
 check(JSON.stringify(restored.state)===JSON.stringify(A.state),`${c.id}: save → restore changed the state`);
 const size={plainBytes:Buffer.byteLength(encoded.plain),gzipBytes:gzipSync(encoded.plain).length,storedBytes:Buffer.byteLength(encoded.json),
  historyRecords:A.state.history.length,memoryLog:A.state.memory.log.length};
 t=performance.now();const m=measure(A.state,HORIZON,exchange,`every ${EXCHANGE_EVERY} years`);timing.measureMs=ms(t);
 return {result:{...m,saveSha256:sha(encoded.plain),size},timing};
}

function engineOnly(c){
 const run=()=>{const s=createCivilization(c.seed),exchange=[{year:0,value:s.exchange}];
  while(s.year<HORIZON){step(s);if(s.pending)chooseAutomatically(s);exchange.push({year:s.year,value:s.exchange});}return {s,exchange};};
 let t=performance.now();const {s,exchange}=run(),advanceMs=ms(t);
 check(JSON.stringify(run().s)===JSON.stringify(s),`${c.id}: engine model differs between two runs`);
 check(exchange.length===HORIZON+1&&exchange.every((p,i)=>p.year===i),`${c.id}: engine exchange is not yearly`);
 return {result:{...measure(s,HORIZON,exchange,'every year'),stateSha256:sha(JSON.stringify(s))},timing:{advanceMs}};
}

const worlds=[];
for(const c of cases){
 const climate=generateClimateBaseline(c.seed),row={...c,climate:{dominantBiome:climate.dominantBiome,transition:climate.transition,effectiveTemperature:climate.effectiveTemperature,effectiveMoisture:climate.effectiveMoisture}};
 for(const model of ['full','engine']){
  const t=performance.now();
  try{const r=model==='full'?await fullWorld(c):engineOnly(c);row[model]={status:'ok',...r.result};row[model+'Timing']={...r.timing,totalMs:ms(t)};}
  catch(e){check(false,`${c.id} ${model}: ${e.message}`);row[model]={status:'failed',error:String(e.message)};row[model+'Timing']={totalMs:ms(t)};}
 }
 // a finding, not a check: do the civilization-wide values of the two models agree (every 10 years; exchange at shared samples)?
 if(row.full.status==='ok'&&row.engine.status==='ok'){const f=row.full.trajectory,e=row.engine.trajectory,ex=new Map(e.exchange);
  row.civilizationWideAgreement={metrics:['population','food','cohesion','knowledge','culture'].every(k=>JSON.stringify(f[k])===JSON.stringify(e[k])),
   exchangeAtSharedYears:f.exchange.every(([y,v])=>y%TRAJECTORY_EVERY!==0||ex.get(y)===v),decisionYears:JSON.stringify(row.full.decisions.years)===JSON.stringify(row.engine.decisions.years)};}
 worlds.push(row);console.log(c.id,'seed',c.seed,JSON.stringify({full:row.fullTiming,engine:row.engineTiming}));
}

// ---- across worlds (no composite score: one distribution per measure, overall and per biome) ----
const scalars={
 'population.end':m=>m.population.end,'population.max':m=>m.population.max,'population.min':m=>m.population.min,
 'population.deepestDecline':m=>m.population.declines.deepest.fraction,'population.declines':m=>m.population.declines.count,
 'population.declinesCensored':m=>m.population.declines.censored,'population.floorYears':m=>m.population.floorYears,
 ...Object.fromEntries(['food','cohesion','knowledge','culture','exchange'].flatMap(k=>[[`${k}.mean`,m=>m.metrics[k].mean],[`${k}.sd`,m=>m.metrics[k].sd],
  [`${k}.nearHighShare`,m=>m.metrics[k].nearHighShare],[`${k}.firstNearHighYear`,m=>m.metrics[k].firstNearHighYear],[`${k}.nearLowShare`,m=>m.metrics[k].nearLowShare],[`${k}.lastQuarterMean`,m=>m.metrics[k].quarterMeans[3]]])),
 'sites.maxScale':m=>Math.max(...m.sites.map(s=>s.maxScale)),'sites.uninhabitedYears':m=>m.sites.reduce((a,s)=>a+s.uninhabitedYears,0),
 'sites.resettled':m=>m.sites.reduce((a,s)=>a+s.resettled,0),'sites.scaleDowns':m=>m.sites.reduce((a,s)=>a+s.scaleDowns,0),
 'center.changes':m=>m.center.changes,
 'chronicle.total':m=>m.chronicle.total,'chronicle.civilizationPerWindowMedian':m=>m.chronicle.perWindow.civilization.median,
 'chronicle.emptyWindows':m=>m.chronicle.emptyWindows,'chronicle.distinctCivilizationKinds':m=>m.chronicle.distinctCivilizationKinds,
 'chronicle.unclassified':m=>m.chronicle.unclassified,
 ...Object.fromEntries(['shortage','trade','damage','society'].map(g=>[`groups.${g}`,m=>m.chronicle.groups[g]])),
 'memory.formed':m=>m.memory.formed,'memory.lost':m=>m.memory.lost,'memory.activeAtHorizon':m=>m.memory.activeAtHorizon.length,
 'decisions.count':m=>m.decisions.count,
};
const across=model=>{const ok=worlds.filter(w=>w[model].status==='ok'),pick=(rows,f)=>distribution(rows.map(w=>f(w[model])));
 return Object.fromEntries(Object.entries(scalars).map(([k,f])=>[k,{all:pick(ok,f),byBiome:Object.fromEntries((quick?QUICK_BIOMES:BIOME_KINDS).map(b=>[b,pick(ok.filter(w=>w.biome===b),f)]))}]));};

let commit=process.env.REVIEW_SOURCE_SHA??null,dirty=null;
try{commit??=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const results={issue:40,stage:'D1a',measureId:MEASURE_ID,analysis:ANALYSIS,quick,horizon:HORIZON,
 models:{full:'createNewArchitectureWorld + advanceArchitectureWorld(automatic)',engine:'story/engine createCivilization + step + chooseAutomatically (no land)'},
 choicePolicy:'production automatic choice (chooseAutomatically: uniform over the options, drawn from the civilization RNG)',
 exchangeSampling:{full:`every ${EXCHANGE_EVERY} years (chunked advance)`,engine:'every year'},trajectoryEvery:TRAJECTORY_EVERY,populationFloor:POPULATION_FLOOR,
 seedAllocation:allocation,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 missing:[
  'full model: exchange outside the sampled years (not in the #29 ledger; never inferred)',
  'annual economy totals (harvest, imports, traded, discarded, moves) and per-district shortage years: not kept in the saved history (coverage keeps the last 5 years); not captured in D1a',
  'episodes: N/A for the current model (it has none); not the same as 0',
  'per-district values of the six metrics: the metrics are civilization-wide only',
 ],
 worlds:worlds.map(({fullTiming,engineTiming,...w})=>w),
 across:{full:across('full'),engine:across('engine')},
 failures};
const resultsJson=JSON.stringify(results);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,
 platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null,cpus:os.cpus().length,heapUsedBytes:process.memoryUsage().heapUsed,
 attempted:cases.length*2,failedWorlds:worlds.flatMap(w=>['full','engine'].filter(m=>w[m].status!=='ok').map(m=>`${w.id} ${m}`)),
 perWorld:worlds.map(w=>({id:w.id,seed:w.seed,full:w.fullTiming,engine:w.engineTiming,size:w.full.size??null}))};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d1a',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
