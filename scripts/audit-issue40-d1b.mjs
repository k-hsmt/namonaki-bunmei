/**
 * Issue #40 D1b: long baseline trial of the current production history and the draw-rate experiment
 * (D0 §11, §12 D1b; Human decisions on D1a and on the D1b load probe).
 *
 *   npm run build && node scripts/audit-issue40-d1b.mjs   →  artifacts/history40-d1b/report.json
 *   Env: HISTORY40_D1B_QUICK=1 (2 worlds to year 1000: a local smoke run), REVIEW_SOURCE_SHA.
 *
 * Worlds: the 10 tuning seeds of each biome (70), to year 5000. Nothing in the game changes.
 *  - full: the current new world, advanced in 1000-year segments with the read-only economy tap (the annual economy of
 *    every year). Exchange is read at the segment ends only (decision 2). Every world is saved (sizes, times); the first
 *    world of each biome is also restored and compared (the round trip is limited to those, decision 1).
 *  - engine: story/engine alone (exchange every year), compared civilization-wide with full.
 *  - draw-rate experiment (decision 2a): a review-only copy of story/engine, generated from dist/story/engine.js with
 *    only the yearly draw probability replaced (scripts/lib/history40-engine-variant.mjs). The production rate run
 *    through the copy must reproduce the production engine exactly (faithfulness). The variants are compared on the
 *    same seeds. Engine only: land-side effects of a variant are not measured.
 * Exits 1 when a check fails. A failing world is reported, not dropped.
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
import {MEASURE_ID,ANALYSIS,allocateSeeds,economyMeasures} from './lib/history40-measures.mjs';
import {measureCivilization,civilizationWideAgreement,acrossWorlds,D1A_SCALARS,TRAJECTORY_EVERY,POPULATION_FLOOR} from './lib/history40-civilization.mjs';
import {loadEngineVariant,DRAW_VARIANTS,PRODUCTION_DRAW} from './lib/history40-engine-variant.mjs';

const out='artifacts/history40-d1b',quick=process.env.HISTORY40_D1B_QUICK==='1';
const HORIZON=quick?1000:5000,SEGMENT=1000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS;
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=50)console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex'),ms=t=>Math.round(performance.now()-t);
const started=performance.now(),startedAt=new Date().toISOString();
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=BIOMES.flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed,rank})));
const withoutTrajectory=({trajectory,...m})=>m;

async function fullWorld(c){
 const timing={};let t=performance.now();
 const created=(await createNewArchitectureWorld(c.seed)).architecture;timing.createMs=ms(t);
 const captures=[],exchange=[{year:0,value:architectureProductionSession(created).state.exchange}];
 t=performance.now();let world=created;
 for(let to=SEGMENT;to<=HORIZON;to+=SEGMENT){
  world=await advanceArchitectureWorld(world,SEGMENT,'automatic',{},cap=>captures.push(cap));const s=architectureProductionSession(world).state;
  if(check(!s.pending&&lastObservedYear(s)===to,`${c.id}: year ${to} not confirmed`))exchange.push({year:to,value:s.exchange});
 }
 timing.advanceMs=ms(t);
 check(captures.length===HORIZON&&captures.every((cap,i)=>cap.year===i+1),`${c.id}: the economy was not captured once per confirmed year`);
 const session=architectureProductionSession(world);
 t=performance.now();const encoded=await encodeWorldSave(await prepareWorldSessionSave(session));timing.saveMs=ms(t);
 const size={storedBytes:Buffer.byteLength(encoded.json),plainBytes:Buffer.byteLength(encoded.plain),gzipBytes:gzipSync(encoded.plain).length,historyRecords:session.state.history.length};
 check(size.storedBytes<=4*1024*1024&&size.plainBytes<=16*1024*1024,`${c.id}: save over the 4 MiB / 16 MiB limit`);
 if(c.rank===0){t=performance.now();const restored=restoreWorldSession(await decodeWorldSave(encoded.json));timing.loadMs=ms(t);
  check(JSON.stringify(restored.state)===JSON.stringify(session.state),`${c.id}: save → restore changed the state`);}
 t=performance.now();
 const m=measureCivilization(session.state,HORIZON,exchange,{exchangeSampling:`every ${SEGMENT} years`,exchangeTrajectoryEvery:SEGMENT,check});
 const economy=economyMeasures(captures);timing.measureMs=ms(t);
 return {result:{...m,economy,saveSha256:sha(encoded.plain),size,roundTrip:c.rank===0},timing};
}

/** Runs an engine module (production or the review-only copy) to the horizon, reading exchange every year. */
function runEngine(engine,seed){
 const s=engine.createCivilization(seed),exchange=[{year:0,value:s.exchange}];
 while(s.year<HORIZON){engine.step(s);if(s.pending)engine.chooseAutomatically(s);exchange.push({year:s.year,value:s.exchange});}
 return {s,exchange};
}
const measureEngine=({s,exchange})=>measureCivilization(s,HORIZON,exchange,{exchangeSampling:'every year',exchangeTrajectoryEvery:TRAJECTORY_EVERY,check});

const production={createCivilization,step,chooseAutomatically};
const variantEngine=await loadEngineVariant(`${out}/tmp`);
const worlds=[];
for(const c of cases){
 const climate=generateClimateBaseline(c.seed),row={...c,climate:{dominantBiome:climate.dominantBiome,effectiveTemperature:climate.effectiveTemperature,effectiveMoisture:climate.effectiveMoisture}};
 let t=performance.now();
 try{const r=await fullWorld(c);row.full={status:'ok',...r.result};row.fullTiming={...r.timing,totalMs:ms(t)};}
 catch(e){check(false,`${c.id} full: ${e.message}`);row.full={status:'failed',error:String(e.message)};row.fullTiming={totalMs:ms(t)};}
 t=performance.now();let productionState=null;
 try{const run=runEngine(production,c.seed);productionState=JSON.stringify(run.s);row.engine={status:'ok',...measureEngine(run)};row.engineTiming={advanceMs:ms(t)};}
 catch(e){check(false,`${c.id} engine: ${e.message}`);row.engine={status:'failed',error:String(e.message)};}
 if(row.full.status==='ok'&&row.engine.status==='ok')row.civilizationWideAgreement=civilizationWideAgreement(row.full,row.engine);
 row.variants={};
 for(const [id,v] of Object.entries(DRAW_VARIANTS)){
  try{variantEngine.setHistory40DrawRate(v.rate);const run=runEngine(variantEngine,c.seed);
   if(id==='production')check(JSON.stringify(run.s)===productionState,`${c.id}: the review-only copy with the production rate differs from production`);
   row.variants[id]={status:'ok',...withoutTrajectory(measureEngine(run))};}
  catch(e){check(false,`${c.id} variant ${id}: ${e.message}`);row.variants[id]={status:'failed',error:String(e.message)};}
 }
 if(row.engine.status==='ok')row.engine=withoutTrajectory(row.engine);
 worlds.push(row);console.log(c.id,'seed',c.seed,JSON.stringify(row.fullTiming),'agreement',JSON.stringify(row.civilizationWideAgreement));
}

// ---- across worlds ----
const EVENT_SCALARS={
 'events.yearsWithEvent':m=>m.chronicle.civilizationYearsWithEvent,'events.windowDispersion':m=>m.chronicle.civilizationWindowDispersion,
 'events.windowMin':m=>m.chronicle.perWindow.civilization.min,'events.windowMax':m=>m.chronicle.perWindow.civilization.max,
 'events.gapMean':m=>m.chronicle.civilizationGaps.mean,'events.gapMax':m=>m.chronicle.civilizationGaps.max,
};
const mean=a=>a.reduce((x,v)=>x+v,0)/a.length;
const ECONOMY_SCALARS={
 'economy.shortageShare':m=>mean(m.economy.districts.map(d=>d.shortageYears))/m.economy.years,
 'economy.runsOfThreeOrMore':m=>m.economy.districts.reduce((a,d)=>a+d.runsOfThreeOrMore,0),
 'economy.longestShortageRun':m=>Math.max(...m.economy.districts.map(d=>d.longestShortageRun)),
 'economy.tradeYearsShare':m=>mean(m.economy.routes.map(r=>r.yearsWithTrade))/m.economy.years,
 'economy.blockedYears':m=>mean(m.economy.routes.map(r=>r.blockedYears)),
 'economy.movesBetweenDistricts':m=>m.economy.moves.betweenDistricts,
 'size.storedBytes':m=>m.size.storedBytes,
};
const variantRows=id=>worlds.map(w=>({biome:w.biome,v:w.variants[id]}));
const results={issue:40,stage:'D1b',measureId:MEASURE_ID,analysis:ANALYSIS,quick,horizon:HORIZON,segment:SEGMENT,populationFloor:POPULATION_FLOOR,
 choicePolicy:'production automatic choice (chooseAutomatically)',
 exchangeSampling:{full:`every ${SEGMENT} years`,engine:'every year',variants:'every year'},
 drawExperiment:{productionExpression:PRODUCTION_DRAW,variants:Object.fromEntries(Object.entries(DRAW_VARIANTS).map(([k,v])=>[k,{description:v.description,rate:String(v.rate)}])),
  note:'review-only copy of story/engine generated from dist; engine only (no land); not proposals for the game'},
 cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 missing:['full model: exchange between segment ends (decision 2); use the engine model for yearly exchange',
  'variants: land-side effects (economy, buildings) are not measured; only the civilization-wide engine',
  'round trip (save → restore) only for the first world of each biome (decision 1)'],
 worlds,
 across:{full:acrossWorlds(worlds,'full',{...D1A_SCALARS,...EVENT_SCALARS,...ECONOMY_SCALARS},BIOMES),
  engine:acrossWorlds(worlds,'engine',{...D1A_SCALARS,...EVENT_SCALARS},BIOMES),
  variants:Object.fromEntries(Object.keys(DRAW_VARIANTS).map(id=>[id,acrossWorlds(variantRows(id),'v',{...D1A_SCALARS,...EVENT_SCALARS},BIOMES)]))},
 failures};
let commit=process.env.REVIEW_SOURCE_SHA??null,dirty=null;
try{commit??=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,
 platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null,cpus:os.cpus().length,
 perWorld:worlds.map(w=>({id:w.id,seed:w.seed,full:w.fullTiming,engine:w.engineTiming}))};
for(const w of worlds){delete w.fullTiming;delete w.engineTiming;}
const resultsJson=JSON.stringify(results);// timings and the environment are in runtime only
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d1b',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
