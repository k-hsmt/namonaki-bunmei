import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {planFacilitySitesReview,selectReviewReservations,reviewNeighborEntrances,reviewFacilityAnchor} from '../dist/terrain/facility-plan-review.js';
import {existingGround} from '../dist/scene/housing-ground.js';
const terrain=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
test('eleven logical slots form disjoint proposals with explicit bridge HOLD in every district',()=>{
 const before=JSON.stringify(terrain);
 for(const site of ['river-bank','hill-side','coast-inlet']){
  const plan=planFacilitySitesReview(terrain,site);assert.equal(plan.status,'review-only');assert.equal(plan.placementPolicy,null);
  assert.equal(plan.slots.length,11);assert.equal(plan.slots[0].kind,'house');assert.ok(plan.slots[0].plot);assert.ok(plan.slots[1].plot);
  assert.equal(plan.slots[7].reason,'unsupported-bridge');assert.equal(plan.slots[7].plot,null);
  const proposed=plan.slots.filter(s=>s.plot);for(let i=0;i<proposed.length;i++)for(let j=i+1;j<proposed.length;j++)assert.equal(overlap(proposed[i].plot,proposed[j].plot),false);
  assert.deepEqual(plan,planFacilitySitesReview(terrain,site));
  const wide=selectReviewReservations(plan,'wide'),minimal=selectReviewReservations(plan,'field-only');
  assert.ok(wide.length>=minimal.length);assert.deepEqual(minimal,[{id:site+'-1',plot:plan.slots[1].plot}]);
  assert.deepEqual(selectReviewReservations(plan,'none'),[]);
  assert.ok(!selectReviewReservations(plan,'wide',new Set([site+'-1'])).some(r=>r.id===site+'-1'));
 }
 assert.equal(JSON.stringify(terrain),before);
});
test('neighbor targets use confirmed kinds and stable IDs, not planned slots',()=>{
 const occupations=[{id:'z',kind:'house',entrance:[5,120]},{id:'a',kind:'house',entrance:[8,120]},{id:'field',kind:'field',entrance:[70,140]}];
 assert.deepEqual(reviewNeighborEntrances('field',occupations),[[8,120],[5,120]]);
 assert.deepEqual(reviewNeighborEntrances('granary',occupations),[[70,140]]);
 assert.deepEqual(reviewNeighborEntrances('civic',occupations),[]);
});
test('ordinary and field anchors invert existing footprint rules',()=>{
 for(const kind of ['house','hall','market','workshop','granary','field']){
  const plot={x:22,y:112,width:kind==='field'?26:18,depth:kind==='field'?14:7};
  const [x,y]=reviewFacilityAnchor(kind,plot);
  assert.deepEqual(existingGround({id:'test',kind,x,y,builtYear:0,condition:'intact'}),plot);
 }
});
