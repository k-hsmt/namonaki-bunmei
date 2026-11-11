/**
 * Issue #35 D2-b1 audit: 10,000-year capacity and verification cost of the v9 architecture layer.
 *   npm run build && node scripts/audit-architecture-d2b.mjs [seed ...]  →  artifacts/architecture35-d2b/audit.json
 * Mechanical evidence only, not a visual acceptance. D2-b2 adds envelope fallback stages and HOLDs
 * (a HOLD makes the advance throw, which this script reports as a failed seed).
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
 const t0=Date.now();try{
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
 // D2-b2: fallback stages, envelope substitutions, and same-year overlaps the earlier-years rule does not test
 const stages={},envelopeSubs={};let sameYearExcessOverlaps=0;
 const bs=w.architecture.births;
 for(const b of bs){stages[b.envelopeStage]=(stages[b.envelopeStage]??0)+1;for(const s of b.substitutions)if(s.reason==='envelope')envelopeSubs[s.axis]=(envelopeSubs[s.axis]??0)+1;}
 const hit=(p,o)=>p.x0<o.x1&&o.x0<p.x1&&p.y0<o.y1&&o.y0<p.y1;
 for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i],c=bs[j];
  if(a.source.year!==c.source.year||a.ref.siteId!==c.ref.siteId||Math.abs(a.envelope.ground-c.envelope.ground)>6)continue;
  if((a.envelope.excess??[]).some(p=>hit(p,c.envelope))||(c.envelope.excess??[]).some(p=>hit(p,a.envelope)))sameYearExcessOverlaps++;}
 const row={seed,year:w.terrain.review.state.year,v8Identical:identical,births:w.architecture.births.length,kinds,envelopeStages:stages,envelopeSubs,sameYearExcessOverlaps,
  terrainCuts:w.terrain.terrainHistory.events.length,
  bytes:{save:json.length,architecture:arch.length,v8:v8json.length,saveGzip:gzipSync(json).length,architectureGzip:gzipSync(arch).length},
  ms:{advance10000WithArchitecture:advanceMs,recomputeArchitectureOnly:recomputeMs,validateV9Total:validateMs}};
 rows.push(row);console.log(JSON.stringify(row));
 }catch(e){const row={seed,hold:true,error:String(e.message).slice(0,300)};rows.push(row);console.log(JSON.stringify(row));}
}
const report={status:'D2B_AUDIT_NOT_ACCEPTANCE',issue:35,stage:'D2-b2',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',years:YEARS,
 limits:{plainBytes:16*1024*1024,gzipStoredBytes:4*1024*1024},rows};
await mkdir('artifacts/architecture35-d2b',{recursive:true});
await writeFile('artifacts/architecture35-d2b/audit.json',JSON.stringify(report,null,2));
