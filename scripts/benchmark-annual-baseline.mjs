import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {advanceAnnualBaseline} from '../dist/irrigation/annual-baseline-internal.js';
const report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),warmups:1,runs:5,
 scope:'Neutral annual ecology including RNG/commit diagnostics versus B batch replay. Same validated v6 output on both sides. Annual includes clone, lifecycle, ecology and freeze; full adds production save preparation. Initialization and IO excluded; not a coupled economic-policy benchmark.',cases:[]};
for(const [seed,years]of [[42,2000],[42,10000],[21,2000]]){
 const initial=createNewIrrigatedWorld(seed).review,runs={baseline:[],annual:[]};let base,next;
 for(let n=0;n<6;n++)for(const mode of n%2?['annual','baseline']:['baseline','annual']){
  const start=performance.now(),world=mode==='baseline'?advanceGeneratedBridgeReview(initial,years,'automatic'):advanceAnnualBaseline(initial,years).world,annualMs=performance.now()-start;
  const save=createGeneratedWorldSave(world),totalMs=performance.now()-start;
  if(mode==='baseline')base=save;else next=save;if(n)runs[mode].push({annualMs,totalMs});
 }
 assert.deepEqual(next,base);const median=(mode,key)=>runs[mode].map(r=>r[key]).sort((a,b)=>a-b)[2];
 const baselineMs=median('baseline','annualMs'),annualMs=median('annual','annualMs'),ratio=annualMs/baselineMs,baselineTotalMs=median('baseline','totalMs'),annualTotalMs=median('annual','totalMs');
 const row={seed,years,baselineMs,annualMs,ratio,baselineTotalMs,annualTotalMs,runs,pass:ratio<=1.10};report.cases.push(row);console.log(JSON.stringify({...row,runs:undefined}));
}
await mkdir('artifacts/environment34-irrigation-coupled',{recursive:true});
await writeFile('artifacts/environment34-irrigation-coupled/annual-baseline-performance.json',JSON.stringify(report,null,2)+'\n');
assert.ok(report.cases.every(c=>c.pass),'Neutral annual driver exceeds B ratio 1.10');
