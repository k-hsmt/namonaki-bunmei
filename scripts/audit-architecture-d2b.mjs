/**
 * Issue #35 D2-b1 audit: 10,000-year capacity and verification cost of the v9 architecture layer.
 *   npm run build && node scripts/audit-architecture-d2b.mjs [seed ...]  →  artifacts/architecture35-d2b/audit.json
 * Mechanical evidence only. Not a visual acceptance (D2-c) and not an envelope check (D2-b2).
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createNewTerrainWorld} from '../dist/story/new-world.js';
import {advanceTerrainProductionWorld} from '../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import * as P from '../dist/architecture/production-v1.js';

const seeds=(process.argv.slice(2).length?process.argv.slice(2):['7','21','198']).map(Number);
const YEARS=10000,rows=[];
for(const seed of seeds){
 const t0=Date.now();
 let w=P.introduceArchitectureProduction((await createNewTerrainWorld(seed)).review);
 w=await P.advanceArchitectureWorld(w,YEARS,'automatic');
 const advanceMs=Date.now()-t0;
 const v8=await advanceTerrainProductionWorld((await createNewTerrainWorld(seed)).review,YEARS,'automatic');
 const identical=(await prepareTerrainProductionSave(w.terrain)).payloadHash===(await prepareTerrainProductionSave(v8)).payloadHash;
 let t=Date.now();P.expectedArchitectureLedger(w.terrain);const recomputeMs=Date.now()-t;
 const save=await P.prepareArchitectureSave(w),json=JSON.stringify(save),arch=JSON.stringify(save.architecture),v8json=JSON.stringify(save.world);
 t=Date.now();await P.validateArchitectureSave(JSON.parse(json));const validateMs=Date.now()-t;
 t=Date.now();await prepareTerrainProductionSave(w.terrain);
 const kinds={};for(const b of w.architecture.births){const k=b.ref.kind+(b.ref.civic?':civic':'')+':'+b.source.kind;kinds[k]=(kinds[k]??0)+1;}
 const row={seed,year:w.terrain.review.state.year,v8Identical:identical,births:w.architecture.births.length,kinds,
  terrainCuts:w.terrain.terrainHistory.events.length,
  bytes:{save:json.length,architecture:arch.length,v8:v8json.length,saveGzip:gzipSync(json).length,architectureGzip:gzipSync(arch).length},
  ms:{advance10000WithArchitecture:advanceMs,recomputeArchitectureOnly:recomputeMs,validateV9Total:validateMs}};
 rows.push(row);console.log(JSON.stringify(row));
}
const report={status:'D2B1_AUDIT_NOT_ACCEPTANCE',issue:35,stage:'D2-b1',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',years:YEARS,
 limits:{plainBytes:16*1024*1024,gzipStoredBytes:4*1024*1024},rows};
await mkdir('artifacts/architecture35-d2b',{recursive:true});
await writeFile('artifacts/architecture35-d2b/audit.json',JSON.stringify(report,null,2));
