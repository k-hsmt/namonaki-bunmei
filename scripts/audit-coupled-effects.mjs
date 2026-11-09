import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createCoupledReview,advanceCoupledReview} from '../dist/irrigation/coupled-progression-v1.js';
import {updateRegionalEconomy,regionalHarvestFactors} from '../dist/story/regional-economy.js';
import {regions} from '../dist/story/population.js';
import {reviewBaseHash} from '../dist/irrigation/wire-v1.js';
const reference=JSON.parse(await readFile('tests/fixtures/coupled-baseline-b-reference.json','utf8'));
const report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'C2 economic-connection milestone: exact neutral B, all-year replay of the carried combined branch, and split continuation. No trial codec, four-way visual comparison, or adoption decision.',cases:[]};
function comparable(world){const {trialBoundary,...review}=world.review;return {...world,format:'generated-bridge-review',review};}
for(const {seed,years,saveHash}of reference.cases){
 const save=createGeneratedWorldSave(createNewIrrigatedWorld(seed).review),baseline=advanceCoupledReview(await createCoupledReview(save,'baseline'),years),b=advanceGeneratedBridgeReview(restoreGeneratedWorld(save),years,'automatic');
 // Comparison only: never register or save a C2 adapter through a production factory.
 assert.deepEqual(comparable(baseline.world),b);assert.equal(await reviewBaseHash(createGeneratedWorldSave(b)),saveHash);
 const start=await createCoupledReview(save,'combined'),combined=advanceCoupledReview(start,years),split=advanceCoupledReview(advanceCoupledReview(start,9900),100);
 assert.deepEqual(split,combined);assert.equal(combined.receipts.length,years);
 let economy=structuredClone(combined.initialEconomy),people,totalDiscarded=0,changedHarvestYears=0;
 const records=new Map(combined.world.review.state.history.map(r=>[r.id,r]));
 for(const [n,r]of combined.receipts.entries()){
  assert.equal(r.year,n+1);assert.equal(r.effect.sourceYear,r.year-1);people=[...r.input[0]];let record=0;
  const factors=regionalHarvestFactors(r.year,seed,r.input[1]);factors[0]*=1+(r.gainBp-r.costBp)/10000;
  const totals=updateRegionalEconomy(economy,people,r.year,{harvestFactors:factors,blockedRegions:new Set(regions.filter((_,i)=>r.input[2]&(1<<i)).map(v=>v.id)),...(r.input[4]?{disruptionId:r.input[4]}:{}),...(r.input[3]>=0?{granaries:regions.map((_,i)=>!!(r.input[3]&(1<<i)))}:{})},event=>{
   const id=r.input[5][record++],source=records.get(id);assert.ok(source);assert.equal(source.year,r.year);
   assert.deepEqual({title:event.title,body:event.body,causes:event.causes,relatedIds:event.relatedIds??[]},{title:source.title,body:source.body,causes:source.causes,relatedIds:source.relatedIds??[]});return id;
  });
  assert.equal(record,r.input[5].length);assert.deepEqual(totals.harvest,r.harvest);assert.deepEqual(totals.discarded,r.discarded);
  totalDiscarded+=r.discarded.reduce((a,b)=>a+b,0);changedHarvestYears+=+(r.harvest[0]!==baseline.receipts[n].harvest[0]);
 }
 assert.deepEqual(economy,combined.world.review.state.economy);assert.deepEqual(people,combined.world.review.state.observation.people);
 for(const p of combined.phases){assert.equal(p.ecologyBefore,p.confirmedBefore);assert.equal(p.ecologyAfter,p.confirmedAfter);if(p.phase!=='step')assert.ok(p.choice&&Number.isSafeInteger(p.choice.index)&&p.choice.fingerprint.startsWith('coupled-decision-template-v1/'));}
 const row={seed,years,baselineExact:true,saveHash,combinedReplayExact:true,splitExact:true,receipts:combined.receipts.length,changedHarvestYears,totalDiscarded};report.cases.push(row);console.log(JSON.stringify(row));
}
await mkdir('artifacts/environment34-irrigation-coupled',{recursive:true});
await writeFile('artifacts/environment34-irrigation-coupled/effects-audit.json',JSON.stringify(report,null,2)+'\n');
