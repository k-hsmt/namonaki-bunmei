import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {reviewBaseHash} from '../dist/irrigation/wire-v1.js';
import {advanceAnnualBaseline} from '../dist/irrigation/annual-baseline-internal.js';

const reference=JSON.parse(await readFile(new URL('../tests/fixtures/coupled-baseline-b-reference.json',import.meta.url),'utf8'));
const report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),referenceSHA:reference.sourceSHA,
 scope:'Neutral annual land/lifecycle/ecology runner. Environment commits before the next civilization phase; complete old B v6 save hashes. No economic feedback or C2 trial codec.',cases:[]};
for(const {seed,years,saveHash} of reference.cases){
 const origin=createNewIrrigatedWorld(seed).review,{world,diagnostics:d}=advanceAnnualBaseline(origin,years);
 const actual=await reviewBaseHash(createGeneratedWorldSave(world));assert.equal(actual,saveHash,'complete original B save, seed '+seed);
 assert.equal(d.ecologySteps,years);
 for(let n=0;n<d.phases.length;n++){
  const p=d.phases[n];assert.equal(p.ecologyBefore,p.confirmedBefore);assert.equal(p.ecologyAfter,p.confirmedAfter);
  if(n)assert.equal(d.phases[n-1].rngAfter,p.rngBefore);
 }
 const row={seed,years,saveHash:actual,baselineExact:true,ecologySteps:d.ecologySteps,totalDraws:d.totalDraws,phases:d.phases.length};
 report.cases.push(row);console.log(JSON.stringify(row));
}
await mkdir('artifacts/environment34-irrigation-coupled',{recursive:true});
await writeFile('artifacts/environment34-irrigation-coupled/annual-baseline-audit.json',JSON.stringify(report,null,2)+'\n');
