/** Production terrain versus immutable preproduction model, not two rewritten trial branches. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNewEconomicWorld} from '../dist/story/new-world.js';
import {advanceEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {prepareEconomicProductionSave} from '../dist/irrigation/economic-production-storage-v1.js';
import {economicProductionViewInternal} from '../dist/irrigation/economic-production-view-internal.js';
import {introduceTerrainProduction,advanceTerrainProductionWorld,slowTerrainProductionClimate} from '../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import {restoreTerrainProductionSave} from '../dist/terrain/terrain-production-history-v1.js';
import {terrainProductionViewInternal} from '../dist/terrain/terrain-production-owned-internal.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {economicTuplesInternal} from '../dist/irrigation/economic-tuples-internal.js';
import {reviewBaseHash} from '../dist/irrigation/wire-v1.js';
const out='artifacts/environment34-terrain-production',sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),reference=JSON.parse(await readFile('tests/fixtures/terrain-trial-preproduction-reference.json','utf8')),c3Reference=JSON.parse(await readFile('tests/fixtures/economic-production-c2-reference.json','utf8')),arg=process.argv.indexOf('--seed');await mkdir(out,{recursive:true});
const normalized=(view,marker)=>{const {[marker]:_,...review}=view.review;return {...view,review:{...review,diagnostics:{holds:{},fullSearches:0}}};};
async function check(expected){
 const seed=expected.seed,root=(await createNewEconomicWorld(seed)).review,baseline=advanceEconomicProductionWorld(root,10000,'automatic'),b=c3Reference.cases.find(c=>c.seed===seed),basePacket=await prepareEconomicProductionSave(baseline);
 assert.equal(await reviewBaseHash(normalized(economicProductionViewInternal(baseline),'economicPolicyBoundary')),b.worldHash);
 await assert.rejects(()=>introduceTerrainProduction(baseline));await writeFile(out+`/seed${seed}-v7-baseline.json`,(await encodeWorldSave(basePacket)).json);
 const initial=await introduceTerrainProduction(root),world=await advanceTerrainProductionWorld(initial,10000,'automatic'),view=terrainProductionViewInternal(world),tuples=economicTuplesInternal(world.economicCoupling),actual={worldHash:await reviewBaseHash(normalized(view,'terrainPolicyBoundary')),receiptsHash:await reviewBaseHash(tuples.receipts),phasesHash:await reviewBaseHash(tuples.phases),changesHash:await reviewBaseHash(world.terrainHistory.events.map(({ruleId,revisionId,parentRevision,...e})=>e))};
 for(const key of Object.keys(actual))assert.equal(actual[key],expected[key],`Frozen D4 ${seed} ${key} differs`);
 assert.equal(world.economicCoupling.originHash,b.originHash);assert.equal(slowTerrainProductionClimate(world),world);
 const packet=await prepareTerrainProductionSave(world),encoded=await encodeWorldSave(packet);let t=performance.now();const loaded=restoreTerrainProductionSave(await decodeWorldSave(encoded.json)),coldReadMs=performance.now()-t;assert.equal((await prepareTerrainProductionSave(loaded)).payloadHash,packet.payloadHash);
 const at9900=await advanceTerrainProductionWorld(initial,9900,'automatic'),continued=await advanceTerrainProductionWorld(restoreTerrainProductionSave(await decodeWorldSave((await encodeWorldSave(await prepareTerrainProductionSave(at9900))).json)),100,'automatic');assert.equal((await prepareTerrainProductionSave(continued)).payloadHash,packet.payloadHash);
 await writeFile(out+`/seed${seed}-v8.json`,encoded.json);
 return {seed,years:10000,referenceSource:reference.source,baselineFixedExact:true,referenceWorldExact:true,referenceReceiptsExact:true,referencePhasesExact:true,referenceChangesExact:true,coldExact:true,resumeExact:true,payloadHash:packet.payloadHash,plainBytes:Buffer.byteLength(encoded.plain),storedBytes:Buffer.byteLength(encoded.json),coldReadMs,projects:world.terrainHistory.events.length,economicRule:world.terrainDevelopment.economicRule,...actual};
}
if(arg>=0){const expected=reference.cases.find(c=>c.seed===Number(process.argv[arg+1]));assert.ok(expected);console.log(JSON.stringify(await check(expected)));}
else{
 const cases=[];for(const expected of reference.cases){const row=JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--seed',String(expected.seed)],{encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,REVIEW_SOURCE_SHA:sourceSHA}}));cases.push(row);console.log(JSON.stringify(row));}
 await writeFile(out+'/audit.json',JSON.stringify({sourceSHA,isolatedCases:true,scope:'Independently advanced actual v7 baseline and owned v8. Immutable preproduction complete-world, economic tuple, phase and terrain geometry references; native cold read, 9900-year gzip continuation, old v7 future preserved.',cases},null,2)+'\n');
}
