import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {createCoupledReview,advanceCoupledReview} from '../dist/irrigation/coupled-progression-v1.js';
import {serializeCoupledReview,encodeCoupledReview,decodeCoupledReview} from '../dist/irrigation/coupled-storage-v1.js';
const out='artifacts/environment34-irrigation-coupled-storage',report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Five complete combined C2 branches, compact independent storage, cold read, and gzip continuation from 9900. No production write or adoption.',cases:[]};await mkdir(out,{recursive:true});
for(const seed of [1,21,29,42,198]){
 const root=await createCoupledReview(createGeneratedWorldSave(createNewIrrigatedWorld(seed).review),'combined'),trial=advanceCoupledReview(root,10000);
 let start=performance.now();const plain=await serializeCoupledReview(trial),stored=await encodeCoupledReview(trial),writeMs=performance.now()-start;
 start=performance.now();const restored=await decodeCoupledReview(stored),coldReadMs=performance.now()-start;assert.equal(await serializeCoupledReview(restored),plain);
 const part=advanceCoupledReview(root,9900),loaded=await decodeCoupledReview(await encodeCoupledReview(part)),continued=advanceCoupledReview(loaded,100);assert.equal(await serializeCoupledReview(continued),plain);
 const plainBytes=Buffer.byteLength(plain),storedBytes=Buffer.byteLength(stored);assert.ok(plainBytes<=16*1024*1024&&storedBytes<=4*1024*1024);
 await writeFile(out+`/seed${seed}-combined.json`,stored);const row={seed,through:10000,plainBytes,storedBytes,writeMs,coldReadMs,checkpoints:trial.checkpoints.length,coldExact:true,resumeExact:true};report.cases.push(row);console.log(JSON.stringify(row));
}
await writeFile(out+'/audit.json',JSON.stringify(report,null,2)+'\n');
