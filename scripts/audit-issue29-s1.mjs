/**
 * Issue #29 S1: capacity and invariance audit of the confirmed civilization metric history (D0 §3.4, §10 S1).
 *
 *   npm run build && node scripts/audit-issue29-s1.mjs   →  artifacts/issue29-s1/report.json
 *   Env: ISSUE29_S1_QUICK=1 (2 seeds, up to year 2000).
 *
 * For each seed, a current (v10) world is advanced in one go to the last audited year and, separately, in steps through
 * every audited year with a save → restore at each step. At every audited year:
 *  - the history has one row per confirmed year from year 0; the last row equals the civilization's values;
 *  - every confirmed year is observable through the one read contract, and its population is the existing ledger's;
 *  - the one-go and the stepped-restored worlds have the same state (metrics, history, RNG) and the same save;
 *  - the compressed save fits the 4 MiB stored limit and the plain save the 16 MiB limit;
 *  - the save bytes the history adds are measured (plain and gzip, the save with and without the history).
 * Exits 1 when a check fails.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {serializeWorldSave} from '../dist/story/world-save.js';
import {lastObservedYear} from '../dist/story/engine.js';
import {observationAt} from '../dist/story/observations.js';
import {observeCivilizationMetrics} from '../dist/story/civilization-metrics.js';

const out='artifacts/issue29-s1',quick=process.env.ISSUE29_S1_QUICK==='1';
const SEEDS=quick?[42,7]:[42,7,1,2026,90210];
const YEARS=quick?[100,1000,2000]:[100,1000,5000,10000];
const STORED_MAX=4*1024*1024,PLAIN_MAX=16*1024*1024;
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const bytes=s=>Buffer.byteLength(s,'utf8');
/** Removes every confirmed metric history from a parsed save (only to measure what the history costs). */
const strip=o=>{if(!o||typeof o!=='object')return;if(o.observation?.metrics)delete o.observation.metrics;for(const v of Object.values(o))strip(v);};

function audit(state,label){
 const m=state.observation.metrics,year=lastObservedYear(state);
 check(m.ruleId==='civilization-metrics-v1'&&m.firstYear===0,`${label}: rule`);
 check(m.values.length===year+1,`${label}: ${m.values.length} rows for confirmed year ${year}`);
 if(!state.pending)check(same(m.values[year],[state.food,state.cohesion,state.knowledge,state.culture]),`${label}: last row differs from the civilization`);
 let t=performance.now();
 for(let y=0;y<=year;y++){
  const o=observeCivilizationMetrics(state,y);
  if(!check(o!==null,`${label}: year ${y} unreadable`))break;
  if(y%97===0)check(o.population===observationAt(state.observation,y).population,`${label}: population ${y}`);
 }
 const readAllMs=performance.now()-t;
 check(observeCivilizationMetrics(state,year+1)===null,`${label}: future year readable`);
 return {readAllMs:+readAllMs.toFixed(1)};
}

const report={generatedAt:new Date().toISOString(),quick,seeds:SEEDS,years:YEARS,limits:{storedBytes:STORED_MAX,plainBytes:PLAIN_MAX},cases:[]};
for(const seed of SEEDS){
 const start=await createNewArchitectureWorld(seed);
 let t=performance.now();
 const whole=await advanceArchitectureWorld(start.architecture,YEARS.at(-1),'automatic');
 const wholeMs=performance.now()-t;
 let stepped=start.architecture,at=0;
 for(const year of YEARS){
  stepped=await advanceArchitectureWorld(stepped,year-at,'automatic');at=year;
  t=performance.now();
  const packet=await prepareWorldSessionSave(architectureProductionSession(stepped));
  const encoded=await encodeWorldSave(packet);
  const saveMs=performance.now()-t;
  t=performance.now();
  const restored=restoreWorldSession(await decodeWorldSave(encoded.json));
  const loadMs=performance.now()-t;
  const label=`seed ${seed} year ${year}`,state=restored.state;
  check(same(state,architectureProductionSession(stepped).state),`${label}: restore changed the state`);
  const reads=audit(state,label);
  const plain=serializeWorldSave(packet),parsed=JSON.parse(plain);strip(parsed);const without=JSON.stringify(parsed);
  const metricsBytes=bytes(JSON.stringify(state.observation.metrics));
  const row={seed,year,rows:state.observation.metrics.values.length,pending:Boolean(state.pending),
   plainBytes:bytes(plain),plainWithoutHistoryBytes:bytes(without),historyJsonBytes:metricsBytes,
   gzipBytes:gzipSync(plain).length,gzipWithoutHistoryBytes:gzipSync(without).length,storedBytes:bytes(encoded.json),
   saveMs:+saveMs.toFixed(1),loadMs:+loadMs.toFixed(1),...reads};
  row.gzipAddedBytes=row.gzipBytes-row.gzipWithoutHistoryBytes;row.plainAddedBytes=row.plainBytes-row.plainWithoutHistoryBytes;
  check(row.storedBytes<=STORED_MAX,`${label}: stored ${row.storedBytes} > 4 MiB`);
  check(row.plainBytes<=PLAIN_MAX,`${label}: plain ${row.plainBytes} > 16 MiB`);
  report.cases.push(row);console.log(JSON.stringify(row));
  stepped=restored.architecture;// the next step continues from the restored world
 }
 const label=`seed ${seed}`;
 check(same(architectureProductionSession(whole).state,architectureProductionSession(stepped).state),`${label}: one-go and stepped/restored states differ`);
 check(same(await prepareWorldSessionSave(architectureProductionSession(whole)),await prepareWorldSessionSave(architectureProductionSession(stepped))),`${label}: one-go and stepped saves differ`);
 report.cases.push({seed,advanceToLastYearMs:+wholeMs.toFixed(0)});
}
report.failures=failures;
await mkdir(out,{recursive:true});await writeFile(`${out}/report.json`,JSON.stringify(report,null,1)+'\n');
console.log(failures.length?`${failures.length} failure(s)`:'all checks passed',`→ ${out}/report.json`);
if(failures.length)process.exit(1);
