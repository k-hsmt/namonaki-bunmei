/** A1 replay audit uses fixed pre-C3 references before checking explicit D4 projections. */
import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import{execFileSync}from'node:child_process';
import {decodeWorldSave} from '../dist/story/world-storage.js';import {restoreEconomicProductionSave} from '../dist/irrigation/economic-production-history-v1.js';
import {observeEconomicProductionScene} from '../dist/scene/economic-production-scene-v1.js';import {observeTerrainRevisionScene} from '../dist/scene/terrain-revision-scene-v1.js';
import {createTerrainHistory,resolveTerrainAtYear} from '../dist/terrain/terrain-revision-v1.js';
const sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),root='artifacts/environment34-irrigation-economic-production',audit=JSON.parse(await readFile(root+'/audit.json','utf8'));assert.equal(audit.sourceSHA,sourceSHA);assert.deepEqual(audit.cases.map(c=>c.seed),[1,21,29,42,198]);
const cases=[];for(const row of audit.cases){
 assert.ok(row.referenceWorldExact&&row.referenceReceiptsExact&&row.referencePhasesExact&&row.coldExact&&row.resumeExact);
 const world=restoreEconomicProductionSave(await decodeWorldSave(await readFile(root+`/seed${row.seed}-v7.json`,'utf8'))),history=await createTerrainHistory(world.review.terrain,10000);let observations=0;
 for(const year of [0,99,100,300,1000,2000,10000])for(let site=0;site<3;site++){
  const original=observeEconomicProductionScene(world,year,site),view=observeTerrainRevisionScene(original,resolveTerrainAtYear(history,year),world.review.state.housing);
  assert.deepEqual({...view,ground:{...view.ground,terrain:history.initial}},original);observations++;
 }
 cases.push({seed:row.seed,observations,initialHash:history.baseHash,referenceExact:true});console.log(JSON.stringify(cases.at(-1)));
}
const out='artifacts/environment34-terrain-revision';await mkdir(out,{recursive:true});await writeFile(out+'/audit.json',JSON.stringify({sourceSHA,scope:'Unchanged D4 physical views over five complete fixed-reference v7 histories; actual same-year ecology, structures and routes.',cases},null,2));
