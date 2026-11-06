/** Full D2 capture/shape/RLE validation and capacity census, no live save writes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {createHousingCivilization,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
const output='artifacts/terrain31-record';await mkdir(output,{recursive:true});
const cases=[],failures=[],started=performance.now();
for(let seed=1;seed<=1000;seed++){
 try{
  const result=generateWorldPrototype(seed);assert.equal(result.status,'ok');
  const record=captureTerrainRecord(result.world,process.env.REVIEW_SOURCE_SHA??'local-unidentified'),bytes=Buffer.byteLength(JSON.stringify(record));
  assert.ok(bytes<=200*1024,'target 200KiB exceeded');cases.push({seed,bytes});
 }catch(error){failures.push({seed,error:String(error)});}
 if(seed%100===0)console.log(JSON.stringify({type:'terrain-record-audit-progress',seed,failures:failures.length}));
}
const legacy=createHousingCivilization(42);while(legacy.year<10000){step(legacy);if(legacy.pending)chooseAutomatically(legacy);}
const existingHistoryBytes=Buffer.byteLength(serializeHousingSave(legacy)),maxBytes=Math.max(...cases.map(x=>x.bytes));
const report={status:'REVIEW_ONLY_NOT_GAME_V5',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',seeds:1000,
 validated:cases.length,failures,targetBytes:200*1024,rejectBytes:1024*1024,
 minBytes:Math.min(...cases.map(x=>x.bytes)),maxBytes,elapsedMs:Math.round(performance.now()-started),
 capacityComponents:{existingV4Seed42Year10000Bytes:existingHistoryBytes,largestTerrainRecordBytes:maxBytes,sumBytes:existingHistoryBytes+maxBytes,
  interpretation:'Arithmetic of independent components only; not a v5 save, not terrain assigned to a legacy world, excludes future v5 framing.'},cases};
await writeFile(output+'/capacity-audit.json',JSON.stringify(report,null,2));
assert.equal(failures.length,0);console.log(JSON.stringify({type:'terrain-record-capacity',validated:cases.length,maxBytes:report.maxBytes,elapsedMs:report.elapsedMs}));
