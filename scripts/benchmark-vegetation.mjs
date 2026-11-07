/** Same placement policy and Node process; only vegetation is enabled/disabled. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
const out='artifacts/vegetation32',report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,warmups:1,measuredRuns:5,scope:'annual progression only; initialization, observation, serialization and hashing excluded',cases:[]};await mkdir(out,{recursive:true});
for(const [seed,year] of [[42,2000],[42,10000],[21,2000]]){
 const row={seed,year};for(const enabled of [false,true]){const initial=createNewWorld(seed,'terrain-placement-v3',enabled).review,values=[];let expected;
  for(let run=0;run<6;run++){const start=performance.now(),r=advanceGeneratedBridgeReview(initial,year,'automatic'),elapsedMs=performance.now()-start,hash=createHash('sha256').update(JSON.stringify(r.review.state)).digest('hex');if(expected)assert.equal(hash,expected);expected=hash;if(run)values.push(elapsedMs);console.log(JSON.stringify({seed,year,enabled,run,elapsedMs}));}
  row[enabled?'vegetation':'baseline']={measuredMs:values,medianMs:[...values].sort((a,b)=>a-b)[2],stateSha256:expected};
 }
 assert.equal(row.vegetation.stateSha256,row.baseline.stateSha256);row.budgetMs=year===2000?5000:25000;row.ratio=row.vegetation.medianMs/Math.max(1000,row.baseline.medianMs);row.pass=row.vegetation.medianMs<=row.budgetMs&&row.ratio<=2;report.cases.push(row);await writeFile(out+'/performance.json',JSON.stringify(report,null,2)+'\n');
}
assert.ok(report.cases.every(c=>c.pass),'vegetation progression exceeds absolute or 2x baseline budget');
