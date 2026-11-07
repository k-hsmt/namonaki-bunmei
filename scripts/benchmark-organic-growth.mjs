/** Annual progression only; compare immutable policy versions on the same runner. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
const out='artifacts/terrain31-organic',report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,seed:1,warmups:1,measuredRuns:5,scope:'annual progression only; initialization, hashing, IO and rendering excluded',cases:[]};await mkdir(out,{recursive:true});
for(const year of [2000,10000]){
 const row={year};for(const policy of ['terrain-placement-v1','terrain-placement-v2']){
  const initial=createNewWorld(1,policy).review,values=[];let expected;
  for(let run=0;run<6;run++){
   const start=performance.now(),result=advanceGeneratedBridgeReview(initial,year,'automatic'),elapsedMs=performance.now()-start;
   const hash=createHash('sha256').update(JSON.stringify(result.review.state)).digest('hex');if(expected)assert.equal(hash,expected);expected=hash;
   if(run)values.push(elapsedMs);console.log(JSON.stringify({year,policy,run,elapsedMs}));
  }
  row[policy]={measuredMs:values,medianMs:[...values].sort((a,b)=>a-b)[2],stateSha256:expected};
 }
 row.budgetMs=year===2000?5000:25000;row.ratio=row['terrain-placement-v2'].medianMs/Math.max(1000,row['terrain-placement-v1'].medianMs);row.pass=row['terrain-placement-v2'].medianMs<=row.budgetMs&&row.ratio<=2;report.cases.push(row);await writeFile(out+'/performance.json',JSON.stringify(report,null,2)+'\n');
}
assert.ok(report.cases.every(c=>c.pass),'organic progression exceeds the absolute or compact-policy ratio budget');
