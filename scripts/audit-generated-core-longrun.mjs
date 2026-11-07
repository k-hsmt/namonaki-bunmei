/** D5 direct-model regression against the preserved fixed-terrain engine.
 * Run after audit-generated-longrun; indirect land/building histories may differ.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {decodeWorldSave} from '../dist/story/world-storage.js';
const out='artifacts/terrain31-d5',seeds=[1,7,21,198];
const core=s=>Object.fromEntries(['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'].map(k=>[k,s[k]]));
const hazards=s=>s.history.filter(e=>['flood','fire','storm','earthquake'].includes(e.kind)).map(e=>[e.year,e.kind]);
const report={sourceSHA:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),seeds,year:10000,
 selection:'Narrow meander, distributary, braided channels and steep H08 world; automatic choices',cases:[],failures:[]};
for(const seed of seeds){
 try{
  const save=await decodeWorldSave(await readFile(`${out}/seed${seed}_year10000_save.json`,'utf8'));
  assert.equal(save.state.year,10000);assert.equal(save.state.seed,seed);
  const baseline=createHousingCivilization(seed);while(baseline.year<10000){step(baseline);if(baseline.pending)chooseAutomatically(baseline);}
  assert.deepEqual(core(save.state),core(baseline),'direct population/resource/RNG model changed');
  assert.deepEqual(save.state.decisions,baseline.decisions,'choices changed');
  assert.deepEqual(hazards(save.state),hazards(baseline),'disaster dates changed');
  report.cases.push({seed,directModelEqual:true,choicesEqual:true,disasterDatesEqual:true});
  console.log(JSON.stringify({seed,status:'direct-model/choices/disaster-dates-equal',year:10000}));
 }catch(error){report.failures.push({seed,error:String(error),stack:error.stack});}
 await writeFile(out+'/core-comparison.json',JSON.stringify(report,null,2)+'\n');
}
assert.equal(report.failures.length,0,'direct-model differences; see core-comparison.json');
assert.equal(report.cases.length,seeds.length);
