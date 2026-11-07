/** D5 annual progression only: one warmup and five measured runs per case.
 * Build both checkouts first. BASELINE_ROOT must identify an unmodified main.
 * Initialization, hashing, rendering and serialization are outside the timer.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const baselineRoot=process.env.BASELINE_ROOT;
assert.ok(baselineRoot,'BASELINE_ROOT is required; never substitute an unmeasured baseline');
const seeds=(process.env.BENCHMARK_SEEDS??'1').split(',').map(Number);
assert.ok(seeds.length&&seeds.every(s=>Number.isSafeInteger(s)&&s>0&&s<=0xffffffff));
const years=(process.env.BENCHMARK_YEARS??'2000,10000').split(',').map(Number);
assert.ok(years.length&&new Set(years).size===years.length&&years.every(y=>y===2000||y===10000),'BENCHMARK_YEARS must select 2000 and/or 10000');
const fixture=JSON.parse(await readFile('tests/fixtures/generated-progression-reference-v1.json','utf8'));
const out=process.env.BENCHMARK_OUT??'artifacts/terrain31-performance';await mkdir(out,{recursive:true});
const moduleAt=(root,file)=>import(pathToFileURL(resolve(root,'dist',file)).href);
const load=async root=>({
 ...await moduleAt(root,'story/new-world.js'),...await moduleAt(root,'story/generated-bridge-review.js'),
 ...await moduleAt(root,'story/housing-persistence.js'),...await moduleAt(root,'story/engine.js'),
 ...await moduleAt(root,'terrain/ground-access-review.js'),...await moduleAt(root,'terrain/placement-search-review.js'),
 ...await moduleAt(root,'story/generated-housing-review.js'),
 ...await moduleAt(root,'story/generated-bridge-history-review.js'),
});
const current=await load('.'),baseline=await load(baselineRoot);
const sha=root=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const report={node:process.version,platform:process.platform,sourceSHA:sha('.'),baselineSHA:sha(baselineRoot),
 diffSha256:createHash('sha256').update(execFileSync('git',['diff'],{encoding:'utf8'})).digest('hex'),
 choices:'automatic',reservation:'field-only',seeds,years,warmups:1,measuredRuns:5,
 initialization:'one template per API/case; mutable legacy state cloned outside timer; immutable generated facade clones internally',
 excludes:['world initialization','rendering','hashing','save/load'],cases:[]};
const previous=process.env.BENCHMARK_BASELINE_REPORT?JSON.parse(await readFile(process.env.BENCHMARK_BASELINE_REPORT,'utf8')):null;
if(previous){assert.equal(previous.baselineSHA,report.baselineSHA);assert.equal(previous.node,report.node);assert.equal(previous.platform,report.platform);report.reusedBaselineReport=process.env.BENCHMARK_BASELINE_REPORT;}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const seed of seeds)for(const year of years){
 const row={seed,year};
 for(const [name,api,legacy] of [['mainGenerated',baseline,false],['currentGenerated',current,false],['mainLegacy',baseline,true]]){
  if(previous&&name!=='currentGenerated'){
   const measured=previous.cases.find(c=>c.seed===seed&&c.year===year)?.[name];
   assert.equal(measured?.measuredMs.length,5,'missing complete baseline measurement');row[name]=measured;continue;
  }
  const values=[],traces=[],template=legacy?api.createHousingCivilization(seed):api.createNewWorld(seed),initialWire=JSON.stringify(template);let expectedHash;
  for(let run=0;run<6;run++){
   const initial=legacy?structuredClone(template):template;
   const metrics=()=>Object.assign({},api.generatedGroundGraphMetrics?.(),api.generatedPlacementSearchMetrics?.(),api.generatedHousingReplayMetrics?.(),api.generatedBridgeProposalMetrics?.());
   const before=metrics();
   const start=performance.now();let state;
   if(legacy){state=initial;while(state.year<year){api.step(state);if(state.pending)api.chooseAutomatically(state);}}
   else state=api.advanceGeneratedBridgeReview(initial.review,year,'automatic').review.state;
   const elapsedMs=performance.now()-start;
   assert.ok(JSON.stringify(template)===initialWire,'benchmark input template mutated');
   const trace=Object.fromEntries(Object.entries(metrics()).map(([key,value])=>[key,value-(before[key]??0)]));
   const stateSha256=createHash('sha256').update(JSON.stringify(state)).digest('hex');
   assert.equal(state.year,year);assert.ok(!state.pending);
   if(expectedHash)assert.equal(stateSha256,expectedHash,'repeated run changed state');expectedHash=stateSha256;
   const pinned=fixture.cases.find(c=>c.seed===seed&&c.year===year);
   if(pinned&&!legacy)assert.equal(stateSha256,pinned.stateSha256,'complete pre-optimization state changed');
   if(run){values.push(elapsedMs);traces.push(trace);}
   console.log(JSON.stringify({seed,year,name,run,warmup:run===0,elapsedMs,stateSha256}));
  }
  row[name]={measuredMs:values,medianMs:median(values),stateSha256:expectedHash,traces};
 }
 assert.equal(row.mainGenerated.stateSha256,row.currentGenerated.stateSha256);
 row.absoluteBudgetMs=year===2000?5000:25000;
 row.mainRatio=row.currentGenerated.medianMs/Math.max(1000,row.mainGenerated.medianMs);
 row.legacyRatio=row.currentGenerated.medianMs/Math.max(1000,row.mainLegacy.medianMs);
 row.absolutePass=row.currentGenerated.medianMs<=row.absoluteBudgetMs;
 row.mainRatioPass=row.mainRatio<=2;
 row.legacyRatioPass=row.legacyRatio<=2;
 // Record both references explicitly: current main already activates generated
 // terrain; the original design's fixed-terrain engine is retained as legacy.
 row.pass=row.absolutePass&&row.mainRatioPass&&row.legacyRatioPass;
 report.cases.push(row);await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
report.pass=report.cases.every(c=>c.pass);
await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:out+'/report.json',pass:report.pass}));
if(!report.pass)process.exitCode=1;
