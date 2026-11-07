/** Organic v2 natural progression and saved continuation; compact v1 fixtures remain frozen. */
import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';
const fixtures=JSON.parse(await readFile('tests/fixtures/generated-progression-reference-v1.json','utf8')).cases;
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex'),out='artifacts/terrain31-organic';await mkdir(out,{recursive:true});
const report={sourceSHA:process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),policy:'terrain-placement-v2',choices:'automatic',timing:'single natural run, initialization and save/load excluded; not a formal median benchmark',cases:[]};
for(const seed of [...new Set(fixtures.map(f=>f.seed))]){
 const initial=createNewWorld(seed,'terrain-placement-v2').review,start=performance.now(),early=advanceGeneratedBridgeReview(initial,100,'automatic'),past=[0,1,99,100].flatMap(y=>[0,1,2].map(i=>hash(observeGeneratedSceneReview(early,y,i)))),end=seed===1?10000:2000;
 const natural=advanceGeneratedBridgeReview(early,end-100,'automatic'),elapsedMs=performance.now()-start,encoded=await encodeWorldSave(createGeneratedWorldSave(natural)),restored=restoreGeneratedWorld(await decodeWorldSave(encoded.json));
 assert.deepEqual(createGeneratedWorldSave(restored),createGeneratedWorldSave(natural));assert.equal(restored.review.growthPattern,'organic-v2');
 assert.deepEqual([0,1,99,100].flatMap(y=>[0,1,2].map(i=>hash(observeGeneratedSceneReview(restored,y,i)))),past);
 assert.deepEqual(createGeneratedWorldSave(advanceGeneratedBridgeReview(restored,60,'automatic')),createGeneratedWorldSave(advanceGeneratedBridgeReview(natural,60,'automatic')));
 // Verify every historic compact fixture independently, with its original policy.
 for(const f of fixtures.filter(f=>f.seed===seed))assert.equal(hash(advanceGeneratedBridgeReview(createNewWorld(seed,'terrain-placement-v1').review,f.year,'automatic').review.state),f.stateSha256);
 const row={seed,year:end,elapsedMs,storedBytes:Buffer.byteLength(encoded.json),stateSha256:hash(natural.review.state),pastChecks:past.length,holds:natural.review.diagnostics.holds};report.cases.push(row);console.log(JSON.stringify({seed,year:end,elapsedMs,status:'save/continuation/past/v1-fixture-pass'}));await writeFile(out+'/audit.json',JSON.stringify(report,null,2)+'\n');
}
assert.equal(report.cases.length,12);
