/** D3-A only: ordinary facility trials, deliberately excluding D3-B housing and D3-C bridges. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {createGeneratedFacilityReview,advanceGeneratedFacilityReview} from '../dist/story/generated-facility-review.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {reviewFacilityAnchor} from '../dist/terrain/facility-plan-review.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {reviewPhysicalPlot} from '../dist/terrain/ground-access-review.js';
const output='artifacts/terrain31-facilities',seeds=[1,3,6,29,85,131,7,198,10,12,21,24],longSeeds=new Set([1,21,198]),modes=['wide','field-only','none'];
const cases=[],failures=[],coreKeys=['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'];
const core=s=>Object.fromEntries(coreKeys.map(k=>[k,s[k]]));
const hazards=s=>s.history.filter(r=>['flood','fire','storm','earthquake'].includes(r.kind)).map(r=>[r.year,r.kind,r.title]);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
function baselineTo(s,year){while(s.year<year){step(s);if(s.pending)chooseAutomatically(s);}}
function census(review){
 const {state,placements}=review,rasters=Object.fromEntries(Object.entries(review.terrain.sites).map(([site,s])=>[site,decodeRecordPhysics(s.physics)]));
 assert.equal(new Set(placements.map(p=>p.objectId)).size,placements.length);
 for(const p of placements){
  assert.equal(reviewPhysicalPlot(rasters[p.site],p.kind,p.plot).status,'clear');
  assert.ok(state.history.some(r=>r.id===p.sourceRecordId&&r.year===p.builtYear&&(p.builtYear===0||r.buildingId===p.objectId)));
  for(const q of placements)if(p!==q&&p.site===q.site)assert.ok(!(p.plot.x<q.plot.x+q.plot.width&&p.plot.x+p.plot.width>q.plot.x&&p.plot.y<q.plot.y+q.plot.depth&&p.plot.y+p.plot.depth>q.plot.y));
 }
 const sites=['river-bank','hill-side','coast-inlet'].map((site,index)=>{
  const ledger=state.observation.sites[index];
  for(const change of ledger.buildingChanges){const p=placements.find(p=>p.objectId===change.building.id);assert.ok(p);assert.deepEqual([change.building.x,change.building.y],reviewFacilityAnchor(p.kind,p.plot));}
  const firstScale=Array.from({length:4},(_,scale)=>ledger.changes.find(c=>c.view.scale===scale)?.year??null);
  const decline=ledger.changes.find((c,i)=>i>0&&c.view.scale<ledger.changes[i-1].view.scale)?.year??null;
  return {site,firstScale,firstDecline:decline,buildings:ledger.view.buildings.length,scaleNow:ledger.view.scale,placements:placements.filter(p=>p.site===site)};
 });
 return {year:state.year,core:core(state),stateSha256:hash(state),placementsSha256:hash(placements),diagnostics:review.diagnostics,sites};
}
await mkdir(output,{recursive:true});
for(const seed of seeds){
 try{
  const generated=generateWorldPrototype(seed);if(generated.status!=='ok'){failures.push({seed,stage:'generation',result:generated});continue;}
  const terrain=captureTerrainRecord(generated.world,process.env.REVIEW_SOURCE_SHA??'local-unidentified'),initial=createGeneratedFacilityReview(terrain,'none');
  await writeFile(output+'/seed'+seed+'_terrain-record.json',JSON.stringify(terrain));
  if(initial.status!=='review-only'){failures.push({seed,stage:'initial-plan',result:initial});continue;}
  const baseline=createHousingCivilization(seed);baselineTo(baseline,2000);
  const baseline2000={core:core(baseline),hazards:hazards(baseline),decisions:structuredClone(baseline.decisions)};
  let baseline10000=null;
  if(longSeeds.has(seed)){baselineTo(baseline,10000);baseline10000={core:core(baseline),hazards:hazards(baseline),decisions:structuredClone(baseline.decisions)};}
  const results=[];
  for(const mode of modes){
   const start={...initial,reservationMode:mode},began=performance.now(),at2000=advanceGeneratedFacilityReview(start,2000,'automatic');
   assert.deepEqual(core(at2000.state),baseline2000.core);assert.deepEqual(hazards(at2000.state),baseline2000.hazards);assert.deepEqual(at2000.state.decisions,baseline2000.decisions);
   const snapshot2000=census(at2000),past=[0,100,1000,2000].map(year=>['river-bank','hill-side','coast-inlet'].map((_,i)=>siteAt(at2000.state.observation.sites,i,year)));
   let snapshot10000=null;
   if(longSeeds.has(seed)){
    const later=advanceGeneratedFacilityReview(at2000,8000,'automatic');
    assert.deepEqual(core(later.state),baseline10000.core);assert.deepEqual(hazards(later.state),baseline10000.hazards);assert.deepEqual(later.state.decisions,baseline10000.decisions);
    const observed=[0,100,1000,2000].map(year=>['river-bank','hill-side','coast-inlet'].map((_,i)=>siteAt(later.state.observation.sites,i,year)));
    assert.deepEqual(observed,past);snapshot10000=census(later);
   }
   results.push({mode,at2000:snapshot2000,at10000:snapshot10000,elapsedMs:Math.round(performance.now()-began),oldViewsEqual:longSeeds.has(seed)?true:null,directModelValuesEqual:true});
  }
  cases.push({seed,variants:Object.fromEntries(Object.entries(terrain.sites).map(([site,s])=>[site,s.variants])),results});
  console.log(JSON.stringify({seed,status:'ordinary-facilities-only',modes:3,longrun:longSeeds.has(seed)}));
 }catch(error){failures.push({seed,stage:'trial',error:String(error),stack:error.stack});}
}
const report={status:'D3A_ORDINARY_FACILITY_REVIEW_ONLY',sourceSHA:process.env.REVIEW_SOURCE_SHA??'local-unidentified',seeds,longSeeds:[...longSeeds],modes,failures,cases,
 limitations:['Not a v5 save; structured copies are not validated game save/resume','No generated housing, civic or public-space progression yet','Bridge slot explicitly HOLD; later river slots may be blocked','Reservation policies cannot be approved from these ordinary-only trials','No generated main Canvas integration or D5 landscape acceptance']};
await writeFile(output+'/longrun-report.json',JSON.stringify(report,null,2));assert.equal(failures.length,0);
console.log(JSON.stringify({status:report.status,worlds:cases.length,trials:cases.length*modes.length,longrunTrials:cases.filter(c=>longSeeds.has(c.seed)).length*modes.length,failures:failures.length}));
