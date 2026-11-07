import test from 'node:test';import assert from 'node:assert/strict';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';
import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {validateGeneratedBridgeLedger,withGeneratedBridgeAccess} from '../dist/story/generated-bridge-history-review.js';
import {groundContextWindows,groundDistances} from '../dist/terrain/ground-access-review.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
const t=captureTerrainRecord(generateWorldPrototype(6).world,'bridge-history-test'),h=captureRiverReaches(t);
const initial=createGeneratedBridgeReview(t,h,'field-only');assert.equal(initial.status,'review-only');
const original=JSON.stringify(initial),completed=advanceGeneratedBridgeReview(initial,2000,'automatic');
test('natural generated construction commits one immutable bridge and retains the direct model',()=>{
 assert.equal(JSON.stringify(initial),original);const r=completed.review,b=r.bridgeReview.bridges[0];
 assert.equal(r.bridgeReview.bridges.length,1);assert.equal(b.builtYear,756);assert.equal(b.geometry.bridgeId,'river-bank-7');
 const changes=r.state.observation.sites[0].buildingChanges.filter(c=>c.building.kind==='bridge');
 assert.deepEqual(changes.map(c=>[c.year,c.building.condition]),[[756,'intact'],[1096,'damaged'],[1104,'intact'],[1289,'ruined']]);
 assert.equal(new Set(changes.map(c=>JSON.stringify([c.building.x,c.building.y,c.building.builtYear]))).size,1);
 const baseline=createHousingCivilization(6);while(baseline.year<2000){step(baseline);if(baseline.pending)chooseAutomatically(baseline);}
 for(const key of ['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'])assert.deepEqual(r.state[key],baseline[key],key);
 const hazards=s=>s.history.filter(e=>['flood','fire','storm','earthquake'].includes(e.kind)).map(e=>[e.year,e.kind]);
 assert.deepEqual(hazards(r.state),hazards(baseline));assert.deepEqual(r.state.decisions,baseline.decisions);validateGeneratedBridgeLedger(r);
});
test('past access opens on construction, closes on damage, reopens on repair and closes on abandonment',()=>{
 const r=completed.review,b=r.bridgeReview.bridges[0],plan=r.plans['river-bank'],raster=decodeRecordPhysics(t.sites['river-bank'].physics);
 // Empty ordinary occupancy isolates the crossing from later unrelated buildings.
 const context=year=>withGeneratedBridgeAccess(r,{terrain:t,site:'river-bank',year,confirmedYear:2000,historyStatus:'known',primaryRoot:plan.primaryRoot,occupancy:[],reservations:[]});
 const before=groundDistances(groundContextWindows(raster,context(755)),plan.primaryRoot),g=b.geometry;
 const far=before[g.bankA[1]*320+g.bankA[0]]<0?g.bankA:g.bankB;
 for(const [year,open] of [[755,false],[756,true],[1095,true],[1096,false],[1103,false],[1104,true],[1288,true],[1289,false],[2000,false]]){
  const ctx=context(year);assert.equal(ctx.crossings.length,open?1:0,year);
  assert.equal(groundDistances(groundContextWindows(raster,ctx),plan.primaryRoot)[far[1]*320+far[0]]>=0,open,year);
  assert.equal(ctx.occupancy.length,year<756?0:3);
 }
 assert.equal(withGeneratedBridgeAccess(r,{...context(2000),site:'hill-side',occupancy:[],crossings:[]}).occupancy.length,0);
});
test('JSON reload and split advancement preserve bridge state and past observations',()=>{
 const earlier=advanceGeneratedBridgeReview(initial,1000,'automatic'),past=siteAt(earlier.review.state.observation.sites,0,800);
 const later=advanceGeneratedBridgeReview(JSON.parse(JSON.stringify(earlier)),1000,'automatic');
 assert.deepEqual(later,completed);assert.deepEqual(siteAt(later.review.state.observation.sites,0,800),past);
 assert.deepEqual(advanceGeneratedBridgeReview(completed,0,'automatic'),completed);
});
test('saved hydrology, geometry, immutable anchors, missing sources and condition tampering fail closed',()=>{
 for(const mutate of [r=>delete r.bridgeReview,r=>delete r.bridgeReview.hydrology,r=>r.bridgeReview.bridges=[],
  r=>r.bridgeReview.bridges.push(structuredClone(r.bridgeReview.bridges[0])),r=>r.bridgeReview.bridges[0].geometry.deck.width+=2,
  r=>r.bridgeReview.bridges[0].sourceRecordId='missing',r=>r.bridgeReview.bridges[0].builtYear++,
  r=>r.state.observation.sites[0].buildingChanges.find(c=>c.building.kind==='bridge').building.x++,
  r=>r.state.observation.sites[0].buildingChanges.find(c=>c.building.kind==='bridge'&&c.building.condition==='damaged').building.condition='intact',
  r=>r.state.observation.sites[0].view.buildings.find(b=>b.kind==='bridge').x++]){
  const bad=structuredClone(completed);mutate(bad.review);const before=JSON.stringify(bad);
  assert.throws(()=>advanceGeneratedBridgeReview(bad,1,'automatic'));assert.equal(JSON.stringify(bad),before);
 }
});
test('a record-boundary batch matches single-year UI advancement and preserves pending choices',()=>{
 const original=JSON.stringify(completed),length=completed.review.state.history.length;let repeated=completed;
 for(let i=0;i<36&&!repeated.review.state.pending;i++){
  repeated=advanceGeneratedBridgeReview(repeated,1,'stop');if(repeated.review.state.history.length>length)break;
 }
 const batch=advanceGeneratedBridgeReview(completed,36,'stop',{stopAtNewRecord:true});assert.deepEqual(batch,repeated);assert.equal(JSON.stringify(completed),original);
 assert.throws(()=>advanceGeneratedBridgeReview(completed,1,'stop',{stopAtNewRecord:'yes'}));
 const pending=advanceGeneratedBridgeReview(initial,1000,'stop');assert.ok(pending.review.state.pending);
 assert.deepEqual(advanceGeneratedBridgeReview(pending,36,'stop',{stopAtNewRecord:true}),pending);
});
