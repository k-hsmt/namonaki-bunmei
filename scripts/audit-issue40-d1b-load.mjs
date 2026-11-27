/**
 * Issue #40 D1b load probe (Human decision 1a on D1a: measure the load of 5000 years on a few worlds before fixing the
 * D1b scale). Read-only, like D1a: the production world is advanced as is, with the read-only economy tap.
 *
 *   npm run build && node scripts/audit-issue40-d1b-load.mjs   →  artifacts/history40-d1b-load/report.json
 *   Env: HISTORY40_D1B_LOAD_QUICK=1 (1 world to year 2000), REVIEW_SOURCE_SHA.
 *
 * Worlds: the first tuning seed of each biome (D1a seed allocation). For each world:
 *  - full: advanced in 1000-year segments; after each segment the world is saved, restored and the next segment
 *    continues FROM THE RESTORED world. Per segment: advance time, save / load time, sizes, records, heap.
 *    The annual economy of every year is captured through the tap (Human decision 3 on D1a).
 *  - the same world advanced in one go to the horizon must equal the segmented, restored one (state and save);
 *  - engine: story/engine alone to the horizon (exchange every year), compared civilization-wide with full.
 * Exchange in the full world is read only at the segment ends (Human decision 2 on D1a: no yearly exchange).
 * Exits 1 when a check fails. A failing world is reported, not dropped.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {createCivilization,step,chooseAutomatically,lastObservedYear} from '../dist/story/engine.js';
import {MEASURE_ID,allocateSeeds,economyMeasures} from './lib/history40-measures.mjs';
import {measureCivilization,civilizationWideAgreement,TRAJECTORY_EVERY} from './lib/history40-civilization.mjs';

const out='artifacts/history40-d1b-load',quick=process.env.HISTORY40_D1B_LOAD_QUICK==='1';
const HORIZON=quick?2000:5000,SEGMENT=1000,STORED_MAX=4*1024*1024,PLAIN_MAX=16*1024*1024;
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex'),ms=t=>Math.round(performance.now()-t),mb=()=>Math.round(process.memoryUsage().heapUsed/1048576);
const started=performance.now(),startedAt=new Date().toISOString();
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=(quick?['temperate_forest']:BIOME_KINDS).map(b=>({id:`${b}-1`,biome:b,seed:allocation.biomes[b].tuning[0]}));

async function fullWorld(c){
 let t=performance.now();const created=(await createNewArchitectureWorld(c.seed)).architecture,createMs=ms(t);
 const captures=[],exchange=[{year:0,value:architectureProductionSession(created).state.exchange}],segments=[];
 let world=created;
 for(let to=SEGMENT;to<=HORIZON;to+=SEGMENT){
  t=performance.now();world=await advanceArchitectureWorld(world,SEGMENT,'automatic',{},cap=>captures.push(cap));const advanceMs=ms(t);
  const session=architectureProductionSession(world),s=session.state;
  if(check(!s.pending&&lastObservedYear(s)===to,`${c.id}: year ${to} not confirmed`))exchange.push({year:to,value:s.exchange});
  t=performance.now();const encoded=await encodeWorldSave(await prepareWorldSessionSave(session)),saveMs=ms(t);
  t=performance.now();const restored=restoreWorldSession(await decodeWorldSave(encoded.json)),loadMs=ms(t);
  check(JSON.stringify(restored.state)===JSON.stringify(s),`${c.id}: save → restore changed the state at ${to}`);
  const row={to,advanceMs,saveMs,loadMs,storedBytes:Buffer.byteLength(encoded.json),plainBytes:Buffer.byteLength(encoded.plain),gzipBytes:gzipSync(encoded.plain).length,
   historyRecords:s.history.length,memoryLog:s.memory.log.length,heapMiB:mb()};
  check(row.storedBytes<=STORED_MAX,`${c.id}: stored ${row.storedBytes} > 4 MiB at ${to}`);check(row.plainBytes<=PLAIN_MAX,`${c.id}: plain ${row.plainBytes} > 16 MiB at ${to}`);
  segments.push(row);console.log(c.id,JSON.stringify(row));
  world=restored.architecture;// the next segment continues from the restored world
 }
 check(captures.length===HORIZON&&captures.every((cap,i)=>cap.year===i+1),`${c.id}: the economy was not captured once per confirmed year`);
 t=performance.now();const oneGo=await advanceArchitectureWorld(created,HORIZON,'automatic'),oneGoMs=ms(t);
 const A=architectureProductionSession(oneGo),B=architectureProductionSession(world);
 check(JSON.stringify(A.state)===JSON.stringify(B.state),`${c.id}: one-go and segmented/restored states differ`);
 const saveA=(await encodeWorldSave(await prepareWorldSessionSave(A))).plain,saveB=(await encodeWorldSave(await prepareWorldSessionSave(B))).plain;
 check(saveA===saveB,`${c.id}: one-go and segmented/restored saves differ`);
 const captureJsonBytes=Buffer.byteLength(JSON.stringify(captures.map(c=>c.economy)));
 return {result:{...measureCivilization(A.state,HORIZON,exchange,{exchangeSampling:`every ${SEGMENT} years`,exchangeTrajectoryEvery:SEGMENT,check}),
   economy:economyMeasures(captures),saveSha256:sha(saveA)},
  timing:{createMs,oneGoMs,segments,economyCaptureJsonBytes:captureJsonBytes}};
}

function engineOnly(c){
 const t=performance.now(),s=createCivilization(c.seed),exchange=[{year:0,value:s.exchange}];
 while(s.year<HORIZON){step(s);if(s.pending)chooseAutomatically(s);exchange.push({year:s.year,value:s.exchange});}
 return {result:measureCivilization(s,HORIZON,exchange,{exchangeSampling:'every year',exchangeTrajectoryEvery:TRAJECTORY_EVERY,check}),timing:{advanceMs:ms(t)}};
}

const worlds=[];
for(const c of cases){
 const row={...c};
 for(const model of ['full','engine']){
  const t=performance.now();
  try{const r=model==='full'?await fullWorld(c):engineOnly(c);row[model]={status:'ok',...r.result};row[model+'Timing']={...r.timing,totalMs:ms(t)};}
  catch(e){check(false,`${c.id} ${model}: ${e.message}`);row[model]={status:'failed',error:String(e.message)};row[model+'Timing']={totalMs:ms(t)};}
 }
 if(row.full.status==='ok'&&row.engine.status==='ok')row.civilizationWideAgreement=civilizationWideAgreement(row.full,row.engine);
 worlds.push(row);console.log(c.id,'seed',c.seed,'total',row.fullTiming.totalMs,'ms; agreement',JSON.stringify(row.civilizationWideAgreement));
}

let commit=process.env.REVIEW_SOURCE_SHA??null,dirty=null;
try{commit??=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const results={issue:40,stage:'D1b-load',measureId:MEASURE_ID,quick,horizon:HORIZON,segment:SEGMENT,
 cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),worlds:worlds.map(({fullTiming,engineTiming,...w})=>w),failures};
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,
 platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null,cpus:os.cpus().length,
 perWorld:worlds.map(w=>({id:w.id,seed:w.seed,full:w.fullTiming,engine:w.engineTiming}))};
await mkdir(out,{recursive:true});
const resultsJson=JSON.stringify(results);
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d1b-load',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
