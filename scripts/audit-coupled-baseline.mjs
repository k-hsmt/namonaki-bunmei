import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {reviewBaseHash} from '../dist/irrigation/wire-v1.js';
import {auditBaselineAdvance} from '../dist/irrigation/coupled-baseline-audit-v1.js';

const reference=JSON.parse(await readFile(new URL('../tests/fixtures/coupled-baseline-b-reference.json',import.meta.url),'utf8'));
const report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),referenceSHA:reference.sourceSHA,
 scope:'Clone-once neutral land driver and phase diagnostics. Full B v6 save hashes from unmodified main; ecology still finalized at batch end. No economic feedback, incremental ecology, trial codec or coupled performance claim.',cases:[]};
for(const {seed,years,saveHash} of reference.cases){
 const origin=createNewIrrigatedWorld(seed).review,{world,diagnostics:d}=auditBaselineAdvance(origin,years);
 const actual=await reviewBaseHash(createGeneratedWorldSave(world));
 assert.equal(actual,saveHash,'complete pre-refactor B save, seed '+seed);
 const commits=d.phases.filter(p=>p.confirmedAfter>p.confirmedBefore);
 assert.equal(commits.length,years);
 for(let i=0;i<commits.length;i++)assert.equal(commits[i].confirmedAfter,i+1);
 for(let i=1;i<d.phases.length;i++)assert.equal(d.phases[i-1].rngAfter,d.phases[i].rngBefore);
 assert.equal(d.phases.at(-1).rngAfter,world.review.state.rngState);
 const row={seed,years,saveHash:actual,baselineExact:true,commits:commits.length,phases:d.phases.length,totalDraws:d.totalDraws,
  maximumStepDraws:Math.max(...d.phases.filter(p=>p.phase==='step').map(p=>p.draws)),automaticChoices:d.phases.filter(p=>p.phase==='automatic-choice').length};
 report.cases.push(row);console.log(JSON.stringify(row));
}
await mkdir('artifacts/environment34-irrigation-coupled',{recursive:true});
await writeFile('artifacts/environment34-irrigation-coupled/baseline-audit.json',JSON.stringify(report,null,2)+'\n');
