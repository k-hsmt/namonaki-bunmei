/** Complete normal v7/v8 branches, actual carried economics and full native-save preparation. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNewEconomicWorld} from '../dist/story/new-world.js';
import {advanceEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {prepareEconomicProductionSave} from '../dist/irrigation/economic-production-storage-v1.js';
import {introduceTerrainProduction,advanceTerrainProductionWorld} from '../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import {restoreTerrainProductionSave} from '../dist/terrain/terrain-production-history-v1.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
const cases=[[42,2000],[42,10000],[21,2000]];
async function measure(seed,years){
 let t=performance.now();const base=(await createNewEconomicWorld(seed)).review,c3InitializationMs=performance.now()-t;t=performance.now();const terrain=await introduceTerrainProduction(base),terrainIntroductionMs=performance.now()-t,runs={c3:[],terrain:[]};let last;
 for(let n=0;n<6;n++)for(const mode of n%2?['terrain','c3']:['c3','terrain']){
  t=performance.now();const next=mode==='c3'?advanceEconomicProductionWorld(base,years,'automatic'):await advanceTerrainProductionWorld(terrain,years,'automatic'),annualMs=performance.now()-t,packet=mode==='c3'?await prepareEconomicProductionSave(next):await prepareTerrainProductionSave(next),encoded=await encodeWorldSave(packet),totalMs=performance.now()-t;if(n)runs[mode].push({annualMs,totalMs});if(mode==='terrain')last={next,packet,encoded};
 }
 const median=(mode,key)=>runs[mode].map(r=>r[key]).sort((a,b)=>a-b)[2],c3AnnualMs=median('c3','annualMs'),c3TotalMs=median('c3','totalMs'),annualMs=median('terrain','annualMs'),totalMs=median('terrain','totalMs'),annualRatio=annualMs/c3AnnualMs,totalRatio=totalMs/c3TotalMs,limitMs=years===10000?25000:5000;
 t=performance.now();const loaded=restoreTerrainProductionSave(await decodeWorldSave(last.encoded.json)),coldReadMs=performance.now()-t;assert.equal((await prepareTerrainProductionSave(loaded)).payloadHash,last.packet.payloadHash);
 return {seed,years,c3InitializationMs,terrainIntroductionMs,c3AnnualMs,c3TotalMs,annualMs,totalMs,annualRatio,totalRatio,limitMs,coldReadMs,plainBytes:Buffer.byteLength(last.encoded.plain),storedBytes:Buffer.byteLength(last.encoded.json),projects:last.next.terrainHistory.events.length,runs,pass:annualMs<=limitMs&&totalMs<=limitMs&&annualRatio<=2&&totalRatio<=2};
}
if(process.argv[2]==='--case'){const seed=Number(process.argv[3]),years=Number(process.argv[4]);assert.ok(cases.some(c=>c[0]===seed&&c[1]===years));console.log(JSON.stringify(await measure(seed,years)));}
else{
 const sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),report={sourceSHA,isolatedCases:true,warmups:1,samples:5,scope:'Normal v7 versus normal terrain v8, independently carried annual branches including land/ecology/economy/diagnostics/checkpoints/freeze. Full adds native packet, SHA and normal gzip envelope. Initial creation/introduction/cold proof separate. Neutral commonization stays checked by legacy C3 and D4 trial jobs.',cases:[]};
 for(const [seed,years]of cases){const row=JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--case',String(seed),String(years)],{encoding:'utf8'}));report.cases.push(row);console.log(JSON.stringify({...row,runs:undefined}));}
 await mkdir('artifacts/environment34-terrain-production',{recursive:true});await writeFile('artifacts/environment34-terrain-production/performance.json',JSON.stringify(report,null,2)+'\n');assert.ok(report.cases.every(c=>c.pass),'Normal terrain exceeds full annual/save performance budgets');
}
