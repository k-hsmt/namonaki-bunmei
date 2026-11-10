/** Serialization stress only: not a feasible terrain event or a native save fixture. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {decodeTerrainTrial,prepareTerrainTrialSave} from '../dist/terrain/terrain-trial-storage-v1.js';
const out='artifacts/environment34-terrain-trial',audit=JSON.parse(await readFile(out+'/audit.json','utf8')),largest=[...audit.cases].sort((a,b)=>b.plainBytes-a.plainBytes)[0];
const world=await decodeTerrainTrial(await readFile(out+`/seed${largest.seed}-terrain-trial.json`,'utf8')),packet=structuredClone(await prepareTerrainTrialSave(world));
// A 26x14 bed with a 2px halo actually has at most 540 cells. Stress the looser
// stored 640-cell safety cap anyway. No invalid synthetic history is published.
const original=packet.terrainHistory.events[0];packet.terrainHistory.events=Array.from({length:4},(_,n)=>({...structuredClone(original),id:'terrain-cut-'+(100+500*n),approvedYear:100+500*n,effectiveYear:101+500*n,cells:Array.from({length:640},(_,i)=>[(i*83+n*997)%57600,1,i%3,0,(i*37+n*13)%256,1,(i+1)%3,0,(i*37+n*13+254)%256]),disturbedPatches:Array.from({length:20},(_,i)=>i+n*40)}));
const plain=Buffer.from(JSON.stringify(packet)),gzip=gzipSync(plain),stored=JSON.stringify({format:'terrain-change-review-gzip-v1',schemaVersion:1,status:'review-only',encoding:'gzip-base64-v1',uncompressedBytes:plain.length,data:gzip.toString('base64')});
const report={sourceSHA:audit.sourceSHA,kind:'serialization-capacity-stress-only',scope:'Largest complete natural save plus four synthetic events of 640 tuples each. These tuples do not describe feasible geometry and are not a valid native save or evidence of legal maximum excavation. Only byte limits are tested; natural exact replay is audited separately.',baseSeed:largest.seed,projects:4,cellsPerProject:640,actualGeometryCellUpperBound:540,plainBytes:plain.length,storedBytes:Buffer.byteLength(stored),plainLimit:16*1024*1024,storedLimit:4*1024*1024};
assert.ok(report.plainBytes<=report.plainLimit&&report.storedBytes<=report.storedLimit);await writeFile(out+'/capacity-stress.json',JSON.stringify({...report,passed:true},null,2)+'\n');console.log(JSON.stringify(report));
