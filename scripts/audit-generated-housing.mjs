/** D3-B housing-only census. All requested seeds/modes, including HOLD and non-city outcomes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {reviewPhysicalPlot} from '../dist/terrain/ground-access-review.js';
import {createGeneratedHousingReview,advanceGeneratedHousingReview} from '../dist/story/generated-housing-review.js';
import {createGeneratedCivicReview,advanceGeneratedCivicReview} from '../dist/story/generated-civic-review.js';
import {validateCivicLedger} from '../dist/story/civic-architecture.js';
import {createGeneratedPublicSpaceReview,advanceGeneratedPublicSpaceReview,validateGeneratedPublicSpaceLedger} from '../dist/story/generated-public-space-review.js';
import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {validateGeneratedBridgeLedger} from '../dist/story/generated-bridge-history-review.js';
import {bridgeOccupancy} from '../dist/terrain/bridge-geometry-review.js';
import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';
import {publicSpacesAt} from '../dist/story/public-space-history.js';
import {housingAt} from '../dist/story/housing-history.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
if(process.env.AUDIT_CIVIC!==undefined&&process.env.AUDIT_CIVIC!=='1')throw Error('Invalid civic audit stage');
if(process.env.AUDIT_PUBLIC_SPACE!==undefined&&process.env.AUDIT_PUBLIC_SPACE!=='1')throw Error('Invalid public-space audit stage');
if(process.env.AUDIT_BRIDGE!==undefined&&process.env.AUDIT_BRIDGE!=='1')throw Error('Invalid bridge audit stage');
const bridge=process.env.AUDIT_BRIDGE==='1',publicSpace=process.env.AUDIT_PUBLIC_SPACE==='1'||bridge,civic=process.env.AUDIT_CIVIC==='1'||publicSpace;
const createReview=bridge?((terrain,mode)=>createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),mode)):publicSpace?createGeneratedPublicSpaceReview:civic?createGeneratedCivicReview:createGeneratedHousingReview;
const advanceReview=bridge?advanceGeneratedBridgeReview:publicSpace?advanceGeneratedPublicSpaceReview:civic?advanceGeneratedCivicReview:advanceGeneratedHousingReview;
const output=bridge?'artifacts/terrain31-bridge':publicSpace?'artifacts/terrain31-public-space':civic?'artifacts/terrain31-civic':'artifacts/terrain31-housing',allSeeds=[1,21,198],allModes=['wide','field-only','none'];
const selectedSeed=process.env.AUDIT_HOUSING_SEED,selectedMode=process.env.AUDIT_HOUSING_MODE;
if((selectedSeed===undefined)!==(selectedMode===undefined)||selectedSeed!==undefined&&(!allSeeds.some(s=>String(s)===selectedSeed)||!allModes.includes(selectedMode)))throw Error('Invalid housing audit shard');
const seeds=selectedSeed===undefined?allSeeds:[Number(selectedSeed)],modes=selectedMode===undefined?allModes:[selectedMode];
const sites=['river-bank','hill-side','coast-inlet'],cases=[],failures=[];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const core=s=>Object.fromEntries(['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'].map(k=>[k,s[k]]));
const hazards=s=>s.history.filter(r=>['flood','fire','storm','earthquake'].includes(r.kind)).map(r=>[r.year,r.kind]);
function baselineTo(s,year){while(s.year<year){step(s);if(s.pending)chooseAutomatically(s);}}
function past(review,years){return years.map(year=>sites.map((site,i)=>({year,site,housing:housingAt(review.state.housing,year,site),facilities:siteAt(review.state.observation.sites,i,year),
 ...(publicSpace?{publicSpaces:publicSpacesAt(review.state.publicSpaces,year,'generated-review-only').spaces.filter(p=>p.siteId===site)}:{})})))};
function inspect(outer){
 const {review}=outer,{state}=review;const built=new Map(),sequences=new Set();
 if(bridge)validateGeneratedBridgeLedger(review);
 if(civic)validateCivicLedger(state.observation.sites,state.history,state.year,'generated-review-only');
 if(publicSpace)validateGeneratedPublicSpaceLedger(review,state.year);
 for(const e of state.housing.events){
  assert.ok(!sequences.has(e.year+':'+e.seq));sequences.add(e.year+':'+e.seq);
  assert.ok(state.history.some(r=>r.id===e.causeRecordId&&r.year===e.year&&r.buildingId===e.blockId));
  if(e.kind==='built')built.set(e.blockId,e.after);
  else {const first=built.get(e.blockId);assert.ok(first);for(const k of ['footprint','builtYear','styleId','styleSeed','siteId'])assert.deepEqual(e.after[k],first[k]);}
 }
 const districts=sites.map((site,i)=>{
  const blocks=housingAt(state.housing,state.year,site).blocks,raster=decodeRecordPhysics(review.terrain.sites[site].physics),facilities=review.placements.filter(p=>p.site===site);
  const communal=publicSpace?publicSpacesAt(state.publicSpaces,state.year,'generated-review-only').spaces.filter(p=>p.siteId===site):[];
  const occupied=[...facilities.map(p=>p.plot),...blocks.map(b=>b.footprint),...communal.map(p=>p.footprint)];
  if(bridge&&site==='river-bank')for(const b of review.bridgeReview.bridges)for(const part of bridgeOccupancy(b.geometry))for(const p of occupied){const q=part.plot;assert.ok(!(p.x<q.x+q.width&&p.x+p.width>q.x&&p.y<q.y+q.depth&&p.y+p.depth>q.y),'ordinary plot overlaps bridge');}
  for(const b of blocks)assert.equal(reviewPhysicalPlot(raster,'housing',b.footprint).status,'clear');
  for(const p of facilities)assert.equal(reviewPhysicalPlot(raster,p.kind,p.plot).status,'clear');
  for(let a=0;a<occupied.length;a++)for(let b=a+1;b<occupied.length;b++){
   const p=occupied[a],q=occupied[b];assert.ok(!(p.x<q.x+q.width&&p.x+p.width>q.x&&p.y<q.y+q.depth&&p.y+p.depth>q.y));
  }
  const ledger=state.observation.sites[i];return {site,housing:blocks,facilityCount:facilities.length,...(civic?{civicBuildings:ledger.view.buildings.filter(b=>b.civic)}:{}),...(publicSpace?{publicSpaces:communal}:{}),cityFirstYear:ledger.changes.find(c=>c.view.scale===3)?.year??null,
   declineFirstYear:ledger.changes.find((c,n)=>n>0&&c.view.scale<ledger.changes[n-1].view.scale)?.year??null};
 });
 return {year:state.year,...(bridge?{bridges:review.bridgeReview.bridges,bridgeChanges:state.observation.sites[0].buildingChanges.filter(c=>c.building.kind==='bridge')} :{}),core:core(state),stateSha256:hash(state),housingEvents:state.housing.events.length,...(publicSpace?{publicSpaceEvents:state.publicSpaces.events}:{}),districts,diagnostics:review.diagnostics};
}
await mkdir(output,{recursive:true});
for(const seed of seeds){
 try{
  const world=generateWorldPrototype(seed);if(world.status!=='ok'){failures.push({seed,stage:'generation',result:world});continue;}
  const terrain=captureTerrainRecord(world.world,process.env.REVIEW_SOURCE_SHA??'local-unidentified'),initial=createReview(terrain,'none');
  if(initial.status!=='review-only'){failures.push({seed,stage:'initial-plan',result:initial});continue;}
  await writeFile(output+'/seed'+seed+'_terrain-record.json',JSON.stringify(terrain));
  const base=createHousingCivilization(seed);baselineTo(base,2000);const base2000={core:core(base),decisions:structuredClone(base.decisions),hazards:hazards(base)};
  let base10000=null;if(seed===1){baselineTo(base,10000);base10000={core:core(base),decisions:structuredClone(base.decisions),hazards:hazards(base)};}
  const results=[];
  for(const mode of modes){
   console.log(JSON.stringify({seed,mode,status:'started',target:seed===1?10000:2000}));
   const start={...initial,review:{...initial.review,reservationMode:mode}},began=performance.now(),at2000=advanceReview(start,2000,'automatic');
   assert.deepEqual(core(at2000.review.state),base2000.core);assert.deepEqual(at2000.review.state.decisions,base2000.decisions);assert.deepEqual(hazards(at2000.review.state),base2000.hazards);
   const snapshot2000=inspect(at2000),years=[0,100,1000,2000],oldViews=past(at2000.review,years);let snapshot10000=null;
   console.log(JSON.stringify({seed,mode,status:'checked',year:2000}));
   if(seed===1){const later=advanceReview(at2000,8000,'automatic');
    assert.deepEqual(core(later.review.state),base10000.core);assert.deepEqual(later.review.state.decisions,base10000.decisions);assert.deepEqual(hazards(later.review.state),base10000.hazards);
    assert.deepEqual(past(later.review,years),oldViews);snapshot10000=inspect(later);
   }
   results.push({mode,at2000:snapshot2000,at10000:snapshot10000,elapsedMs:Math.round(performance.now()-began),directModelEqual:true,pastViewsEqual:seed===1?true:null});
   console.log(JSON.stringify({seed,mode,status:bridge?'bridge-stage-only':publicSpace?'public-space-stage-only':civic?'civic-stage-only':'housing-stage-only',year:seed===1?10000:2000}));
  }cases.push({seed,results});
 }catch(error){failures.push({seed,error:String(error),stack:error.stack});}
}
const report={status:bridge?'D3C_BRIDGE_REVIEW_ONLY':publicSpace?'D3B_PUBLIC_SPACE_REVIEW_ONLY':civic?'D3B_CIVIC_REVIEW_ONLY':'D3B_HOUSING_REVIEW_ONLY',sourceSHA:process.env.REVIEW_SOURCE_SHA??'local-unidentified',seeds,
 seedSelection:'Fixed before the trial: narrow river, braided river/terrace, rocky valley/coast. No replacement after failures.',modes,cases,failures,
 limitations:[bridge?'Generated bridge trial only; live UI remains fixed terrain':publicSpace?'No generated bridges yet':civic?'No generated public-space or bridges yet':'No generated civic/public-space or bridges yet','No v5 save validation or live UI integration','Only 3 seeds at 2000 years, only seed1 at10000; not D5','No final Q5 reservation-policy approval from this partial stage']};
await writeFile(output+'/longrun-report.json',JSON.stringify(report,null,2));assert.equal(failures.length,0);
console.log(JSON.stringify({status:report.status,worlds:cases.length,trials:cases.length*modes.length,longrunTrials:cases.filter(c=>c.seed===1).length*modes.length,failures:failures.length}));
